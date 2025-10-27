import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Google Drive sync...');

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('User authenticated:', user.id);

    // Delete existing spreadsheets before syncing
    const { error: deleteError } = await supabaseClient
      .from('spreadsheets')
      .delete()
      .eq('user_id', user.id);
    
    if (deleteError) {
      console.error('Error deleting old spreadsheets:', deleteError);
    } else {
      console.log('Old spreadsheets cleared');
    }

    // Get Google credentials
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const folderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID');

    if (!serviceAccountJson || !folderId) {
      throw new Error('Google Drive credentials not configured');
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (parseError) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', parseError);
      throw new Error('Invalid Google Service Account JSON format. Please verify the secret contains valid JSON.');
    }

    // Create JWT for Google OAuth
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    // Encode JWT
    const encoder = new TextEncoder();
    const headerBase64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const claimBase64 = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signatureInput = `${headerBase64}.${claimBase64}`;

    // Import private key
    const privateKey = serviceAccount.private_key;
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = privateKey.substring(
      pemHeader.length,
      privateKey.length - pemFooter.length
    ).replace(/\s/g, '');
    
    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

    // Sign JWT
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      encoder.encode(signatureInput)
    );

    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = `${signatureInput}.${signatureBase64}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token error:', error);
      throw new Error('Failed to get access token');
    }

    const { access_token } = await tokenResponse.json();
    console.log('Access token obtained');

    // List spreadsheet files from folder
    const filesResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+(mimeType='application/vnd.google-apps.spreadsheet'+or+mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'+or+mimeType='text/csv')&fields=files(id,name,mimeType)`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    if (!filesResponse.ok) {
      const error = await filesResponse.text();
      console.error('Files list error:', error);
      throw new Error('Failed to list files');
    }

    const { files } = await filesResponse.json();
    console.log(`Found ${files.length} files`);

    const results = [];

    // Process each file
    for (const file of files) {
      try {
        console.log(`Processing file: ${file.name}`);

        // Export Google Sheets as CSV
        let downloadUrl;
        if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`;
        } else {
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
        }

        const fileResponse = await fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        });

        if (!fileResponse.ok) {
          console.error(`Failed to download ${file.name}`);
          continue;
        }

        const fileBlob = await fileResponse.blob();

        // Send to parse-spreadsheet function
        const formData = new FormData();
        formData.append('file', fileBlob, file.name);

        const parseResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/parse-spreadsheet`,
          {
            method: 'POST',
            headers: {
              Authorization: authHeader,
            },
            body: formData,
          }
        );

        if (!parseResponse.ok) {
          console.error(`Failed to parse ${file.name}`);
          continue;
        }

        const parseResult = await parseResponse.json();
        results.push({
          fileName: file.name,
          success: true,
          data: parseResult,
        });
        console.log(`Successfully processed ${file.name}`);
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        results.push({
          fileName: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
