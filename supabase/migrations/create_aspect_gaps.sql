-- Create aspect_gaps table for tracking missing category aspects
CREATE TABLE IF NOT EXISTS aspect_gaps (
  id SERIAL PRIMARY KEY,
  category_id TEXT NOT NULL,
  category_name TEXT,
  aspect_name TEXT NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  sample_asins TEXT[],
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, aspect_name)
);

CREATE INDEX IF NOT EXISTS idx_aspect_gaps_category ON aspect_gaps(category_id);
CREATE INDEX IF NOT EXISTS idx_aspect_gaps_count ON aspect_gaps(occurrence_count DESC);

-- Enable RLS
ALTER TABLE aspect_gaps ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" ON aspect_gaps
  FOR ALL USING (true);
