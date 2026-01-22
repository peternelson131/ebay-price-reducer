-- Social Media Connections and Posting
-- Supports YouTube, Instagram, Facebook, TikTok (extensible)

-- Store OAuth connections for social platforms
CREATE TABLE IF NOT EXISTS social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'youtube', 'instagram', 'facebook', 'tiktok'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  account_id TEXT, -- platform-specific account/channel ID
  account_name TEXT, -- display name
  account_avatar TEXT, -- profile picture URL
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- User's posting schedule preferences
CREATE TABLE IF NOT EXISTS posting_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  post_time TIME NOT NULL DEFAULT '09:00', -- daily post time
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Scheduled posts queue and history
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES product_videos(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  title TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, posting, posted, failed
  posted_at TIMESTAMPTZ,
  platform_post_id TEXT, -- ID returned by platform (YouTube video ID, etc.)
  platform_url TEXT, -- Direct URL to the post
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own connections
CREATE POLICY "Users can manage their own social connections"
  ON social_connections FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own posting schedules"
  ON posting_schedules FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own scheduled posts"
  ON scheduled_posts FOR ALL
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_social_connections_user_platform ON social_connections(user_id, platform);
CREATE INDEX idx_posting_schedules_user_platform ON posting_schedules(user_id, platform);
CREATE INDEX idx_scheduled_posts_status ON scheduled_posts(status, scheduled_for);
CREATE INDEX idx_scheduled_posts_user ON scheduled_posts(user_id);
