-- Create spreadsheets table to store uploaded spreadsheet data
CREATE TABLE IF NOT EXISTS public.spreadsheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  headers TEXT[] NOT NULL,
  rows JSONB NOT NULL,
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.spreadsheets ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public access (since this is a public-facing feature)
CREATE POLICY "Allow public read access to spreadsheets"
  ON public.spreadsheets
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to spreadsheets"
  ON public.spreadsheets
  FOR INSERT
  WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_spreadsheets_updated_at
  BEFORE UPDATE ON public.spreadsheets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();