-- OneDrive Video Integration
-- Created: 2026-01-21
-- Purpose: Support user OneDrive connections and product video storage

-- =============================================================================
-- Table 1: user_onedrive_connections
-- =============================================================================
-- Stores encrypted OAuth tokens and connection settings for each user's OneDrive

CREATE TABLE user_onedrive_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  default_folder_id TEXT,
  default_folder_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient user lookups
CREATE INDEX idx_onedrive_connections_user_id ON user_onedrive_connections(user_id);

-- Index for token expiration monitoring
CREATE INDEX idx_onedrive_connections_expires_at ON user_onedrive_connections(token_expires_at);

-- =============================================================================
-- Table 2: product_videos
-- =============================================================================
-- Tracks videos uploaded to OneDrive and associated with products

CREATE TABLE product_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES sourced_products(id) ON DELETE CASCADE,
  onedrive_file_id TEXT NOT NULL,
  onedrive_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  upload_status TEXT DEFAULT 'complete',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, onedrive_file_id)
);

-- Index for user video queries
CREATE INDEX idx_product_videos_user_id ON product_videos(user_id);

-- Index for product video queries
CREATE INDEX idx_product_videos_product_id ON product_videos(product_id);

-- Index for OneDrive file lookups
CREATE INDEX idx_product_videos_onedrive_file_id ON product_videos(onedrive_file_id);

-- Index for upload status monitoring
CREATE INDEX idx_product_videos_upload_status ON product_videos(upload_status) 
  WHERE upload_status != 'complete';

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on both tables
ALTER TABLE user_onedrive_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_videos ENABLE ROW LEVEL SECURITY;

-- user_onedrive_connections policies
-- Users can only view/modify their own connection
CREATE POLICY "Users can view own OneDrive connection" 
  ON user_onedrive_connections FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own OneDrive connection" 
  ON user_onedrive_connections FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own OneDrive connection" 
  ON user_onedrive_connections FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own OneDrive connection" 
  ON user_onedrive_connections FOR DELETE 
  USING (auth.uid() = user_id);

-- product_videos policies
-- Users can only view/modify their own videos
CREATE POLICY "Users can view own videos" 
  ON product_videos FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own videos" 
  ON product_videos FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos" 
  ON product_videos FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos" 
  ON product_videos FOR DELETE 
  USING (auth.uid() = user_id);

-- =============================================================================
-- Triggers for updated_at timestamp
-- =============================================================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to user_onedrive_connections
CREATE TRIGGER update_user_onedrive_connections_updated_at 
  BEFORE UPDATE ON user_onedrive_connections
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE user_onedrive_connections IS 'Stores encrypted Microsoft OAuth tokens for OneDrive integration';
COMMENT ON TABLE product_videos IS 'Tracks product videos stored in user OneDrive accounts';

COMMENT ON COLUMN user_onedrive_connections.access_token_encrypted IS 'AES-256-GCM encrypted Microsoft access token';
COMMENT ON COLUMN user_onedrive_connections.refresh_token_encrypted IS 'AES-256-GCM encrypted Microsoft refresh token';
COMMENT ON COLUMN user_onedrive_connections.token_expires_at IS 'When the access token expires (typically 1 hour from issue)';
COMMENT ON COLUMN user_onedrive_connections.default_folder_id IS 'OneDrive folder ID where videos are uploaded by default';
COMMENT ON COLUMN user_onedrive_connections.default_folder_path IS 'Human-readable path for the default folder';

COMMENT ON COLUMN product_videos.onedrive_file_id IS 'Unique file identifier from Microsoft Graph API';
COMMENT ON COLUMN product_videos.upload_status IS 'Upload status: pending, uploading, complete, failed';
COMMENT ON COLUMN product_videos.duration_seconds IS 'Video duration in seconds (if available from metadata)';
