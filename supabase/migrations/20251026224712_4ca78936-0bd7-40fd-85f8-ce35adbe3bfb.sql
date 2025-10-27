-- Create table to store uploaded spreadsheets data
CREATE TABLE public.spreadsheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  headers TEXT[] NOT NULL,
  rows JSONB NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_spreadsheets_created_at ON public.spreadsheets(created_at DESC);

-- Enable RLS
ALTER TABLE public.spreadsheets ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (public access for chatbot)
CREATE POLICY "Allow public read access"
ON public.spreadsheets
FOR SELECT
USING (true);

-- Allow anyone to insert (public upload)
CREATE POLICY "Allow public insert access"
ON public.spreadsheets
FOR INSERT
WITH CHECK (true);