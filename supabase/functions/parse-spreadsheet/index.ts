import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedData {
  headers: string[];
  rows: any[];
  summary: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verify user via provided JWT token explicitly (avoids AuthSessionMissingError)
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth verification failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'Nenhum arquivo enviado' }), 
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log('Processing file:', file.name, 'Type:', file.type, 'Size:', file.size);

    const fileName = file.name.toLowerCase();
    let parsedData: ParsedData;

    if (fileName.endsWith('.csv')) {
      parsedData = await parseCSV(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      parsedData = await parseExcel(file);
    } else {
      return new Response(
        JSON.stringify({ 
          error: 'Formato não suportado. Use arquivos CSV.' 
        }), 
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log('File parsed successfully:', {
      headers: parsedData.headers,
      rowCount: parsedData.rows.length
    });

    // Save to database with user_id
    const { error: dbError } = await supabaseClient
      .from('spreadsheets')
      .insert({
        file_name: file.name,
        headers: parsedData.headers,
        rows: parsedData.rows,
        summary: parsedData.summary,
        user_id: user.id,
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar arquivo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Spreadsheet saved to database');

    return new Response(
      JSON.stringify(parsedData), 
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Parse error:", e);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao processar arquivo'
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function parseCSV(file: File): Promise<ParsedData> {
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('Arquivo vazio');
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    if (values.length === headers.length) {
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }

  const summary = `Planilha com ${rows.length} linhas e ${headers.length} colunas. Colunas: ${headers.join(', ')}`;

  return {
    headers,
    rows,
    summary
  };
}

async function parseExcel(file: File): Promise<ParsedData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (jsonData.length === 0) {
    throw new Error('Planilha vazia');
  }

  const headers = (jsonData[0] as any[]).map(h => String(h).trim());
  const rows: any[] = [];

  for (let i = 1; i < jsonData.length; i++) {
    const values = jsonData[i] as any[];
    if (values && values.length > 0) {
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? String(values[index]) : '';
      });
      rows.push(row);
    }
  }

  const summary = `Planilha "${firstSheetName}" com ${rows.length} linhas e ${headers.length} colunas. Colunas: ${headers.join(', ')}`;

  return {
    headers,
    rows,
    summary
  };
}
