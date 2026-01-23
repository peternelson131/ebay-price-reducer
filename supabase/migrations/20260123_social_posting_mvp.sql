-- Social Posting MVP: Enhanced tables with encrypted tokens
-- Phase 1: Foundation for Instagram + YouTube posting

-- ============================================================================
-- OAUTH STATES: CSRF protection for OAuth flows
-- ============================================================================
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for state lookup and cleanup
CREATE INDEX idx_oauth_states_state ON oauth_states(state);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

-- RLS for OAuth states
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own OAuth states"
  ON oauth_states FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- SOCIAL ACCOUNTS: OAuth connections with encrypted tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'youtube', 'facebook', 'tiktok', 'twitter', 'linkedin', 'pinterest', 'threads', 'bluesky')),
  username TEXT,
  account_id TEXT, -- Platform-specific account/channel ID
  access_token TEXT NOT NULL, -- AES-256-GCM encrypted
  refresh_token TEXT, -- AES-256-GCM encrypted (nullable for platforms without refresh)
  token_expires_at TIMESTAMPTZ,
  account_metadata JSONB, -- Platform-specific metadata (avatar, follower count, etc.)
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, account_id)
);

-- ============================================================================
-- SOCIAL POSTS: Post creation, scheduling, and lifecycle
-- ============================================================================
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES product_videos(id) ON DELETE SET NULL,
  caption TEXT,
  scheduled_at TIMESTAMPTZ, -- NULL = draft, NOW() = post immediately, future = scheduled
  platforms JSONB NOT NULL DEFAULT '[]'::jsonb, -- ["instagram", "youtube"]
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'processing', 'posted', 'failed', 'cancelled')),
  metadata JSONB, -- Platform-specific overrides, hashtags, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ -- When the scheduler picked it up
);

-- ============================================================================
-- POST RESULTS: Per-platform posting results
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  error_code TEXT,
  platform_post_id TEXT, -- Instagram media ID, YouTube video ID, etc.
  platform_post_url TEXT, -- Direct link to the post
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB, -- Platform-specific response data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES: Query optimization
-- ============================================================================

-- Social Accounts
CREATE INDEX idx_social_accounts_user_platform ON social_accounts(user_id, platform) WHERE is_active = true;
CREATE INDEX idx_social_accounts_token_expiry ON social_accounts(token_expires_at) WHERE token_expires_at IS NOT NULL AND is_active = true;

-- Social Posts
CREATE INDEX idx_social_posts_user_status ON social_posts(user_id, status);
CREATE INDEX idx_social_posts_scheduled ON social_posts(scheduled_at) WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;
CREATE INDEX idx_social_posts_video ON social_posts(video_id) WHERE video_id IS NOT NULL;
CREATE INDEX idx_social_posts_created ON social_posts(created_at DESC);

-- Post Results
CREATE INDEX idx_post_results_post ON post_results(post_id);
CREATE INDEX idx_post_results_account ON post_results(social_account_id);
CREATE INDEX idx_post_results_success ON post_results(success, posted_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_results ENABLE ROW LEVEL SECURITY;

-- Social Accounts: Users manage their own accounts
CREATE POLICY "Users can view their own social accounts"
  ON social_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own social accounts"
  ON social_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own social accounts"
  ON social_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own social accounts"
  ON social_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Social Posts: Users manage their own posts
CREATE POLICY "Users can view their own social posts"
  ON social_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own social posts"
  ON social_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own social posts"
  ON social_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own social posts"
  ON social_posts FOR DELETE
  USING (auth.uid() = user_id);

-- Post Results: Users can view results for their posts
CREATE POLICY "Users can view results for their posts"
  ON post_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_posts
      WHERE social_posts.id = post_results.post_id
      AND social_posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Service can insert post results"
  ON post_results FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_posts
      WHERE social_posts.id = post_results.post_id
      AND social_posts.user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS: Documentation
-- ============================================================================

COMMENT ON TABLE social_accounts IS 'OAuth connections for social media platforms with encrypted tokens';
COMMENT ON COLUMN social_accounts.access_token IS 'AES-256-GCM encrypted access token';
COMMENT ON COLUMN social_accounts.refresh_token IS 'AES-256-GCM encrypted refresh token';
COMMENT ON COLUMN social_accounts.account_metadata IS 'Platform-specific data: avatar, display name, follower count, etc.';

COMMENT ON TABLE social_posts IS 'Social media posts with scheduling and multi-platform support';
COMMENT ON COLUMN social_posts.scheduled_at IS 'NULL=draft, NOW()=immediate, future=scheduled';
COMMENT ON COLUMN social_posts.platforms IS 'Array of target platforms: ["instagram", "youtube"]';
COMMENT ON COLUMN social_posts.status IS 'Lifecycle: draft → scheduled → processing → posted/failed';

COMMENT ON TABLE post_results IS 'Per-platform posting results for tracking success/failure';
COMMENT ON COLUMN post_results.platform_post_id IS 'Platform-specific ID (Instagram media_id, YouTube video_id)';
COMMENT ON COLUMN post_results.platform_post_url IS 'Direct URL to view the post on the platform';
