-- Thumbnail Templates for auto-generation
-- Stores user-uploaded base templates for compositing product images
-- Each template is linked to a CRM owner (from crm_owners table)

CREATE TABLE IF NOT EXISTS thumbnail_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  owner_id UUID REFERENCES crm_owners(id) ON DELETE CASCADE NOT NULL,  -- Links to CRM owner
  template_storage_path TEXT NOT NULL,  -- OneDrive path or Supabase storage path
  placement_zone JSONB NOT NULL,  -- {x, y, width, height} as percentages (0-100)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, owner_id)  -- One template per owner per user
);

-- Create indexes
CREATE INDEX idx_thumbnail_templates_user_id ON thumbnail_templates(user_id);
CREATE INDEX idx_thumbnail_templates_owner_id ON thumbnail_templates(owner_id);

-- Enable RLS
ALTER TABLE thumbnail_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own templates"
  ON thumbnail_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates"
  ON thumbnail_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON thumbnail_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON thumbnail_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Add thumbnail columns to influencer_tasks
ALTER TABLE influencer_tasks 
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES thumbnail_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_influencer_tasks_template_id ON influencer_tasks(template_id);

-- Comments
COMMENT ON TABLE thumbnail_templates IS 'User-uploaded base templates for auto-generating video thumbnails';
COMMENT ON COLUMN thumbnail_templates.placement_zone IS 'JSONB: {x, y, width, height} stored as percentages (0-100) for responsive scaling';
COMMENT ON COLUMN influencer_tasks.thumbnail_url IS 'URL to auto-generated thumbnail with product composited onto template';
COMMENT ON COLUMN influencer_tasks.template_id IS 'Reference to the template used for auto-generation';
