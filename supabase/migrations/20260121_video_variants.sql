-- Video Variants & Marketplaces Schema
-- Created: 2026-01-21
-- Purpose: Track dubbed video variants and marketplace language requirements

-- =============================================================================
-- Table: video_variants
-- =============================================================================
-- Stores dubbed versions of videos in different languages

CREATE TABLE IF NOT EXISTS video_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_video_id UUID NOT NULL REFERENCES product_videos(id) ON DELETE CASCADE,
  language TEXT NOT NULL,  -- 'German', 'French', 'Spanish', 'Italian', 'Japanese'
  language_code TEXT NOT NULL,  -- 'de', 'fr', 'es', 'it', 'ja'
  
  -- OneDrive storage (after dub completes)
  onedrive_file_id TEXT,
  onedrive_path TEXT,
  filename TEXT NOT NULL,
  file_size BIGINT,
  
  -- Dubbing status
  dub_status TEXT DEFAULT 'pending' CHECK (dub_status IN ('pending', 'processing', 'complete', 'failed')),
  dub_job_id TEXT,  -- Eleven Labs job reference
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- One variant per language per video
  UNIQUE(original_video_id, language_code)
);

-- Indexes
CREATE INDEX idx_video_variants_original_video ON video_variants(original_video_id);
CREATE INDEX idx_video_variants_status ON video_variants(dub_status) WHERE dub_status != 'complete';
CREATE INDEX idx_video_variants_language ON video_variants(language_code);

-- =============================================================================
-- Table: marketplaces
-- =============================================================================
-- Reference table for Amazon marketplace info

CREATE TABLE IF NOT EXISTS marketplaces (
  code TEXT PRIMARY KEY,  -- 'US', 'DE', etc.
  name TEXT NOT NULL,
  language TEXT NOT NULL,  -- 'English', 'German', etc.
  language_code TEXT NOT NULL,  -- 'en', 'de', etc.
  requires_dubbing BOOLEAN DEFAULT false,
  amazon_domain TEXT,
  upload_url TEXT
);

-- Seed marketplace data
INSERT INTO marketplaces (code, name, language, language_code, requires_dubbing, amazon_domain, upload_url)
VALUES
  ('US', 'United States', 'English', 'en', false, 'amazon.com', 'https://www.amazon.com/creatorhub/video/upload'),
  ('CA', 'Canada', 'English', 'en', false, 'amazon.ca', 'https://www.amazon.ca/creatorhub/video/upload'),
  ('UK', 'United Kingdom', 'English', 'en', false, 'amazon.co.uk', 'https://www.amazon.co.uk/creatorhub/video/upload'),
  ('AU', 'Australia', 'English', 'en', false, 'amazon.com.au', 'https://www.amazon.com.au/creatorhub/video/upload'),
  ('DE', 'Germany', 'German', 'de', true, 'amazon.de', 'https://www.amazon.de/creatorhub/video/upload'),
  ('FR', 'France', 'French', 'fr', true, 'amazon.fr', 'https://www.amazon.fr/creatorhub/video/upload'),
  ('ES', 'Spain', 'Spanish', 'es', true, 'amazon.es', 'https://www.amazon.es/creatorhub/video/upload'),
  ('IT', 'Italy', 'Italian', 'it', true, 'amazon.it', 'https://www.amazon.it/creatorhub/video/upload'),
  ('MX', 'Mexico', 'Spanish', 'es', true, 'amazon.com.mx', 'https://www.amazon.com.mx/creatorhub/video/upload'),
  ('JP', 'Japan', 'Japanese', 'ja', true, 'amazon.co.jp', 'https://www.amazon.co.jp/creatorhub/video/upload')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  language = EXCLUDED.language,
  language_code = EXCLUDED.language_code,
  requires_dubbing = EXCLUDED.requires_dubbing,
  amazon_domain = EXCLUDED.amazon_domain,
  upload_url = EXCLUDED.upload_url;

-- =============================================================================
-- RLS Policies for video_variants
-- =============================================================================

ALTER TABLE video_variants ENABLE ROW LEVEL SECURITY;

-- Users can view variants of their own videos
CREATE POLICY "Users can view own video variants"
  ON video_variants FOR SELECT
  USING (
    original_video_id IN (
      SELECT id FROM product_videos WHERE user_id = auth.uid()
    )
  );

-- Users can insert variants for their own videos
CREATE POLICY "Users can insert own video variants"
  ON video_variants FOR INSERT
  WITH CHECK (
    original_video_id IN (
      SELECT id FROM product_videos WHERE user_id = auth.uid()
    )
  );

-- Users can update their own video variants
CREATE POLICY "Users can update own video variants"
  ON video_variants FOR UPDATE
  USING (
    original_video_id IN (
      SELECT id FROM product_videos WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own video variants
CREATE POLICY "Users can delete own video variants"
  ON video_variants FOR DELETE
  USING (
    original_video_id IN (
      SELECT id FROM product_videos WHERE user_id = auth.uid()
    )
  );

-- Marketplaces is public read
CREATE POLICY "Marketplaces are public"
  ON marketplaces FOR SELECT
  USING (true);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE video_variants IS 'Stores dubbed video variants in different languages';
COMMENT ON TABLE marketplaces IS 'Amazon marketplace reference data with language requirements';
COMMENT ON COLUMN video_variants.dub_status IS 'pending=waiting, processing=dubbing in progress, complete=done, failed=error';
