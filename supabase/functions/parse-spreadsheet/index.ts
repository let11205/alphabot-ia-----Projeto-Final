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
  metadata: {
    fileName: string;
    rowCount: number;
    period: { year: number | null; month: number | null };
  };
}

const SCHEMA_MAPPING: Record<string, string[]> = {
  Data: ['data', 'date', 'fecha', 'datum'],
  ID_Transacao: ['id_transacao', 'id', 'transacao', 'transaction_id', 'id_venda'],
  Produto: ['produto', 'product', 'item', 'articulo'],
  Categoria: ['categoria', 'category', 'tipo', 'type'],
  Regiao: ['regiao', 'region', 'area', 'estado', 'state'],
  Quantidade: ['quantidade', 'qtd', 'quantity', 'qty', 'unidades'],
  Preco_Unitario: ['preco_unitario', 'preco', 'price', 'unit_price', 'valor_unitario'],
  Receita_Total: ['receita_total', 'valor_total', 'total', 'revenue', 'receita'],
};

function normalizeHeader(header: string): string {
  const cleaned = header.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
  for (const [standard, variants] of Object.entries(SCHEMA_MAPPING)) {
    if (variants.some(v => cleaned.includes(v))) {
      return standard;
    }
  }
  return header;
}

function parseDate(dateStr: string): { date: string; year: number; month: number } | null {
  if (!dateStr) return null;
  
  // Try various date formats
  const str = String(dateStr).trim();
  
  // YYYY-MM-DD
  let match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return { 
      date: `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`,
      year: parseInt(match[1]),
      month: parseInt(match[2])
    };
  }
  
  // DD/MM/YYYY or MM/DD/YYYY
  match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const d1 = parseInt(match[1]);
    const d2 = parseInt(match[2]);
    const year = parseInt(match[3]);
    // Assume DD/MM/YYYY if d1 > 12
    const [day, month] = d1 > 12 ? [d1, d2] : [d2, d1];
    return {
      date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      year,
      month
    };
  }
  
  return null;
}

function normalizeRow(row: any, headerMap: Map<string, string>): any {
  const normalized: any = {};
  
  for (const [original, standard] of headerMap.entries()) {
    const value = row[original];
    
    if (standard === 'Data') {
      const parsed = parseDate(value);
      if (parsed) {
        normalized.Data = parsed.date;
        normalized.Ano = parsed.year;
        normalized.Mes = parsed.month;
        normalized.Trimestre = Math.ceil(parsed.month / 3);
      }
    } else if (standard === 'Quantidade') {
      normalized.Quantidade = parseInt(value) || 0;
    } else if (standard === 'Preco_Unitario' || standard === 'Receita_Total') {
      const cleaned = String(value).replace(/[^0-9.,]/g, '').replace(',', '.');
      normalized[standard] = parseFloat(cleaned) || 0;
    } else {
      normalized[standard] = value;
    }
  }
  
  // Calculate Receita_Total if missing
  if (!normalized.Receita_Total && normalized.Quantidade && normalized.Preco_Unitario) {
    normalized.Receita_Total = normalized.Quantidade * normalized.Preco_Unitario;
  }
  
  return normalized;
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('Processing file:', file.name);

    const fileName = file.name.toLowerCase();
    let parsedData: ParsedData;

    if (fileName.endsWith('.csv')) {
      parsedData = await parseCSV(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      parsedData = await parseExcel(file);
    } else {
      return new Response(
        JSON.stringify({ error: 'Formato não suportado. Use CSV, XLS ou XLSX.' }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize data
    const originalHeaders = parsedData.headers;
    const headerMap = new Map<string, string>();
    originalHeaders.forEach(h => {
      headerMap.set(h, normalizeHeader(h));
    });

    const normalizedRows = parsedData.rows.map(row => normalizeRow(row, headerMap));
    const standardHeaders = ['Data', 'ID_Transacao', 'Produto', 'Categoria', 'Regiao', 'Quantidade', 'Preco_Unitario', 'Receita_Total', 'Ano', 'Mes', 'Trimestre'];

    // Detect period from data
    let minYear: number | null = null;
    let maxYear: number | null = null;
    let minMonth: number | null = null;
    let maxMonth: number | null = null;

    normalizedRows.forEach(row => {
      if (row.Ano) {
        if (minYear === null || row.Ano < minYear) minYear = row.Ano;
        if (maxYear === null || row.Ano > maxYear) maxYear = row.Ano;
      }
      if (row.Mes) {
        if (minMonth === null || row.Mes < minMonth) minMonth = row.Mes;
        if (maxMonth === null || row.Mes > maxMonth) maxMonth = row.Mes;
      }
    });

    const period = {
      year: minYear === maxYear ? minYear : null,
      month: minMonth === maxMonth ? minMonth : null
    };

    const metadata = {
      fileName: file.name,
      rowCount: normalizedRows.length,
      period
    };

    console.log('Normalized data:', { headers: standardHeaders, rowCount: normalizedRows.length, metadata });

    const { error: dbError } = await supabaseClient
      .from('spreadsheets')
      .insert({
        file_name: file.name,
        headers: standardHeaders,
        rows: normalizedRows,
        summary: `${normalizedRows.length} registros normalizados`,
        user_id: user.id,
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar arquivo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        headers: standardHeaders, 
        rows: normalizedRows.slice(0, 5), // Return only first 5 for preview
        rowCount: normalizedRows.length,
        metadata 
      }), 
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Parse error:", e);
    return new Response(
      JSON.stringify({ error: 'Erro ao processar arquivo' }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function parseCSV(file: File): Promise<ParsedData> {
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) throw new Error('Arquivo vazio');

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

  return {
    headers,
    rows,
    summary: `${rows.length} linhas`,
    metadata: { fileName: file.name, rowCount: rows.length, period: { year: null, month: null } }
  };
}

async function parseExcel(file: File): Promise<ParsedData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (jsonData.length === 0) throw new Error('Planilha vazia');

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

  return {
    headers,
    rows,
    summary: `${rows.length} linhas`,
    metadata: { fileName: file.name, rowCount: rows.length, period: { year: null, month: null } }
  };
}
