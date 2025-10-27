import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { messages, datasetSummary } = await req.json();
    console.log('Chat request received:', { messagesCount: messages.length, datasetSummary });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create Supabase client with user's token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verify user via provided JWT token explicitly (avoids AuthSessionMissingError)
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth verification failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's stored spreadsheets from database with ALL data
    const { data: spreadsheets, error: dbError } = await supabase
      .from('spreadsheets')
      .select('file_name, headers, rows')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Database error:', dbError);
    }

    // Build context from stored spreadsheets with COMPLETE data
    let storedDataContext = '';
    if (spreadsheets && spreadsheets.length > 0) {
      storedDataContext = '\n\nDados completos das planilhas enviadas:\n\n';
      spreadsheets.forEach(sheet => {
        storedDataContext += `=== Planilha: ${sheet.file_name} ===\n`;
        storedDataContext += `Colunas: ${sheet.headers.join(', ')}\n`;
        storedDataContext += `Total de linhas: ${sheet.rows.length}\n`;
        // Limitar para primeiras 100 linhas para não exceder limite de contexto
        const rowsToShow = sheet.rows.slice(0, 100);
        storedDataContext += `Dados (primeiras ${rowsToShow.length} linhas):\n${JSON.stringify(rowsToShow, null, 2)}\n\n`;
      });
      console.log('Context size:', storedDataContext.length, 'characters');
    }

    const systemPrompt = `Você é um analista de vendas especializado da Alpha Insights.
Seu papel é analisar dados de vendas e fornecer insights claros e objetivos em português brasileiro.

IMPORTANTE: Você tem acesso COMPLETO a todos os dados das planilhas enviadas pelo usuário.
${storedDataContext}

Diretrizes:
- Responda sempre em português brasileiro
- Seja objetivo e direto
- Use TODOS os dados disponíveis para análises precisas
- Quando perguntarem sobre vendas, produtos, períodos, etc., consulte os dados completos acima
- Forneça números exatos, não estimativas
- Calcule totais, médias e agregações quando necessário
- Mantenha um tom profissional mas acessível
- Se não houver dados suficientes para responder, peça ao usuário que envie uma planilha`;

    console.log('Calling AI gateway with model:', 'google/gemini-2.5-flash');
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    console.log('AI gateway response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }), 
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }), 
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Erro ao processar sua solicitação" }), 
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(
      JSON.stringify({ error: 'Erro ao processar mensagem' }), 
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
