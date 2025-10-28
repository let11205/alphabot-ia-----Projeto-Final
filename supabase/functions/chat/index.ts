import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parser de períodos em português
const MONTHS_PT: Record<string, number> = {
  'janeiro': 1, 'jan': 1,
  'fevereiro': 2, 'fev': 2,
  'março': 3, 'mar': 3,
  'abril': 4, 'abr': 4,
  'maio': 5, 'mai': 5,
  'junho': 6, 'jun': 6,
  'julho': 7, 'jul': 7,
  'agosto': 8, 'ago': 8,
  'setembro': 9, 'set': 9,
  'outubro': 10, 'out': 10,
  'novembro': 11, 'nov': 11,
  'dezembro': 12, 'dez': 12,
};

interface QueryContext {
  years: number[];
  months: number[];
  produtos: string[];
  categorias: string[];
  regioes: string[];
  metrics: string[];
  comparison: boolean;
  topN: number | null;
}

function parseQuery(query: string, allData: any[]): QueryContext {
  const lower = query.toLowerCase();
  const context: QueryContext = {
    years: [],
    months: [],
    produtos: [],
    categorias: [],
    regioes: [],
    metrics: [],
    comparison: false,
    topN: null
  };

  // Detectar anos (YYYY)
  const yearMatches = query.match(/\b(20\d{2})\b/g);
  if (yearMatches) {
    context.years = yearMatches.map(y => parseInt(y));
  }

  // Detectar meses
  for (const [name, num] of Object.entries(MONTHS_PT)) {
    if (lower.includes(name)) {
      if (!context.months.includes(num)) context.months.push(num);
    }
  }

  // Detectar métricas
  if (lower.match(/\b(quantidade|qtd|unidades|volume)\b/)) context.metrics.push('quantidade');
  if (lower.match(/\b(receita|valor|faturamento|vendas)\b/)) context.metrics.push('receita');
  if (lower.match(/\b(preço|preco|média|medio|ticket)\b/)) context.metrics.push('preco_medio');
  if (lower.match(/\b(crescimento|variação|variacao|comparação|comparacao|vs|versus)\b/)) context.comparison = true;

  // Detectar Top N
  const topMatch = lower.match(/\b(top|maior|melhor|principal)\s*(\d+)/);
  if (topMatch) {
    context.topN = parseInt(topMatch[2]);
  }

  // Detectar produtos/categorias/regiões específicos
  const uniqueProdutos = [...new Set(allData.map(r => r.Produto).filter(Boolean))];
  const uniqueCategorias = [...new Set(allData.map(r => r.Categoria).filter(Boolean))];
  const uniqueRegioes = [...new Set(allData.map(r => r.Regiao).filter(Boolean))];

  uniqueProdutos.forEach(p => {
    if (lower.includes(p.toLowerCase())) context.produtos.push(p);
  });
  uniqueCategorias.forEach(c => {
    if (lower.includes(c.toLowerCase())) context.categorias.push(c);
  });
  uniqueRegioes.forEach(r => {
    if (lower.includes(r.toLowerCase())) context.regioes.push(r);
  });

  return context;
}

function filterData(data: any[], context: QueryContext): any[] {
  return data.filter(row => {
    if (context.years.length > 0 && !context.years.includes(row.Ano)) return false;
    if (context.months.length > 0 && !context.months.includes(row.Mes)) return false;
    if (context.produtos.length > 0 && !context.produtos.includes(row.Produto)) return false;
    if (context.categorias.length > 0 && !context.categorias.includes(row.Categoria)) return false;
    if (context.regioes.length > 0 && !context.regioes.includes(row.Regiao)) return false;
    return true;
  });
}

function analyzeData(data: any[], context: QueryContext): any {
  const analysis: any = {
    total_registros: data.length,
    receita_total: 0,
    quantidade_total: 0,
    ticket_medio: 0,
    periodo_analizado: '',
    grupos: []
  };

  if (data.length === 0) {
    return { ...analysis, erro: 'Nenhum dado encontrado para os filtros especificados' };
  }

  // Calcular totais
  data.forEach(row => {
    analysis.receita_total += row.Receita_Total || 0;
    analysis.quantidade_total += row.Quantidade || 0;
  });

  analysis.ticket_medio = analysis.receita_total / data.length;

  // Detectar período
  const years = [...new Set(data.map(r => r.Ano))].sort();
  const months = [...new Set(data.map(r => r.Mes))].sort();
  
  if (years.length === 1 && months.length === 1) {
    const monthName = Object.keys(MONTHS_PT).find(k => MONTHS_PT[k] === months[0]) || months[0];
    analysis.periodo_analizado = `${monthName}/${years[0]}`;
  } else if (years.length === 1) {
    analysis.periodo_analizado = `${years[0]}`;
  } else {
    analysis.periodo_analizado = `${years[0]} a ${years[years.length - 1]}`;
  }

  // Agrupamentos e Top N
  if (context.topN || context.comparison) {
    const groupBy = context.produtos.length === 0 ? 'Produto' : 
                    context.categorias.length === 0 ? 'Categoria' : 'Regiao';
    
    const groups = new Map<string, { receita: number; quantidade: number; count: number }>();
    
    data.forEach(row => {
      const key = row[groupBy] || 'Outros';
      if (!groups.has(key)) {
        groups.set(key, { receita: 0, quantidade: 0, count: 0 });
      }
      const g = groups.get(key)!;
      g.receita += row.Receita_Total || 0;
      g.quantidade += row.Quantidade || 0;
      g.count++;
    });

    const sorted = Array.from(groups.entries())
      .map(([nome, stats]) => ({
        nome,
        receita_total: stats.receita,
        quantidade_total: stats.quantidade,
        ticket_medio: stats.receita / stats.count
      }))
      .sort((a, b) => b.receita_total - a.receita_total);

    analysis.grupos = context.topN ? sorted.slice(0, context.topN) : sorted;
    analysis.grupo_por = groupBy;
  }

  // Comparação temporal (se solicitado)
  if (context.comparison && months.length > 1) {
    const byMonth = new Map<number, { receita: number; quantidade: number }>();
    data.forEach(row => {
      const key = row.Mes;
      if (!byMonth.has(key)) {
        byMonth.set(key, { receita: 0, quantidade: 0 });
      }
      const m = byMonth.get(key)!;
      m.receita += row.Receita_Total || 0;
      m.quantidade += row.Quantidade || 0;
    });

    const monthlyData = Array.from(byMonth.entries())
      .map(([mes, stats]) => {
        const monthName = Object.keys(MONTHS_PT).find(k => MONTHS_PT[k] === mes) || mes.toString();
        return { mes: monthName, ...stats };
      })
      .sort((a, b) => {
        const aNum = MONTHS_PT[a.mes.toLowerCase()] || parseInt(a.mes);
        const bNum = MONTHS_PT[b.mes.toLowerCase()] || parseInt(b.mes);
        return aNum - bNum;
      });

    if (monthlyData.length >= 2) {
      const last = monthlyData[monthlyData.length - 1];
      const prev = monthlyData[monthlyData.length - 2];
      const growth = ((last.receita - prev.receita) / prev.receita) * 100;
      analysis.variacao_mensal = {
        crescimento_pct: growth.toFixed(2),
        periodo_anterior: prev.mes,
        periodo_atual: last.mes
      };
    }

    analysis.evolucao_mensal = monthlyData;
  }

  return analysis;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages } = await req.json();
    const userQuery = messages[messages.length - 1].content;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar todas as planilhas do usuário
    const { data: spreadsheets, error: dbError } = await supabase
      .from('spreadsheets')
      .select('file_name, rows')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar dados' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!spreadsheets || spreadsheets.length === 0) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { 
              role: "system", 
              content: "Você é o Alphabot IA, analista de vendas da Alpha Insights. Informe educadamente que nenhuma planilha foi enviada ainda. Peça ao usuário que envie arquivos CSV, XLS ou XLSX com dados de vendas para você poder analisar."
            },
            { role: "user", content: userQuery }
          ],
          stream: true,
        }),
      });

      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Consolidar todos os dados
    const allData: any[] = [];
    spreadsheets.forEach(sheet => {
      allData.push(...(sheet.rows || []));
    });

    console.log(`Total data: ${allData.length} rows from ${spreadsheets.length} files`);

    // Analisar a query e filtrar dados
    const context = parseQuery(userQuery, allData);
    const filteredData = filterData(allData, context);
    
    // Se não houver dados após filtro, verificar se período foi especificado
    if (filteredData.length === 0 && (context.years.length > 0 || context.months.length > 0)) {
      const availablePeriods = [...new Set(allData.map(r => {
        if (r.Ano && r.Mes) {
          const monthName = Object.keys(MONTHS_PT).find(k => MONTHS_PT[k] === r.Mes) || r.Mes;
          return `${monthName}/${r.Ano}`;
        }
        return null;
      }).filter(Boolean))].join(', ');

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { 
              role: "system", 
              content: `Você é o Alphabot IA, analista de vendas da Alpha Insights. Informe educadamente que não encontrou dados para o período solicitado nas planilhas enviadas. Períodos disponíveis: ${availablePeriods}. Ofereça usar os dados disponíveis para responder a pergunta.`
            },
            { role: "user", content: userQuery }
          ],
          stream: true,
        }),
      });

      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Executar análise por código
    const analysis = analyzeData(filteredData.length > 0 ? filteredData : allData, context);
    
    const scopeDesc = filteredData.length < allData.length 
      ? `Análise filtrada (${filteredData.length} de ${allData.length} registros)` 
      : `Análise completa (${allData.length} registros de ${spreadsheets.length} planilha(s))`;

    // Chamar Gemini apenas para narrar
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é o Alphabot IA, analista de vendas da Alpha Insights. Responda em português brasileiro de forma objetiva, profissional e analítica.

DADOS DA ANÁLISE (já calculados por código - use APENAS estes números):
${JSON.stringify(analysis, null, 2)}

ESCOPO DA ANÁLISE: ${scopeDesc}

INSTRUÇÕES OBRIGATÓRIAS:
- Use APENAS os números fornecidos acima (não invente ou estime dados)
- Sempre cite períodos específicos e unidades nas respostas
- Formate valores monetários como R$ com duas casas decimais (ex: R$ 1.234,56)
- Formate percentuais com símbolo % (ex: 15,3%)
- Apresente rankings e comparações de forma clara e estruturada
- Se houver evolução temporal, explique tendências e variações
- Seja direto, objetivo e use linguagem profissional
- Se um dado solicitado não existir, informe isso educadamente e baseie-se nos dados disponíveis`;

    console.log('Calling Gemini for narrative generation');

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery }
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido." }), 
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes." }), 
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Erro ao processar análise" }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(
      JSON.stringify({ error: 'Erro ao processar mensagem' }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
