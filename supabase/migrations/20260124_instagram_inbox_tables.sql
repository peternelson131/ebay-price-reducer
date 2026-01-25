-- Instagram Messaging Inbox: Unified inbox for Instagram DMs
-- MVP Scope: Fetch conversations, send replies, webhook notifications

-- ============================================================================
-- INBOX CONVERSATIONS: Aggregate conversations across platforms
-- ============================================================================
CREATE TABLE IF NOT EXISTS inbox_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'whatsapp', 'twitter')),
  external_id TEXT NOT NULL, -- Platform-specific conversation ID
  participant_name TEXT,
  participant_avatar TEXT,
  participant_id TEXT, -- Platform-specific participant ID
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  metadata JSONB, -- Platform-specific metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, external_id)
);

-- ============================================================================
-- INBOX MESSAGES: Individual messages in conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL, -- Platform-specific message ID
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'sticker')),
  attachments JSONB, -- Media attachments, URLs, etc.
  sent_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  metadata JSONB, -- Platform-specific metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, external_id)
);

-- ============================================================================
-- INBOX BLOCKLIST: Privacy filter for hiding contacts
-- ============================================================================
CREATE TABLE IF NOT EXISTS inbox_blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'whatsapp', 'twitter')),
  external_participant_id TEXT NOT NULL, -- Platform-specific user ID
  participant_name TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, external_participant_id)
);

-- ============================================================================
-- INDEXES: Query optimization
-- ============================================================================

-- Inbox Conversations
CREATE INDEX idx_inbox_conversations_user_platform 
  ON inbox_conversations(user_id, platform) 
  WHERE is_archived = false;
CREATE INDEX idx_inbox_conversations_last_message 
  ON inbox_conversations(last_message_at DESC);
CREATE INDEX idx_inbox_conversations_unread 
  ON inbox_conversations(user_id, unread_count) 
  WHERE unread_count > 0;
CREATE INDEX idx_inbox_conversations_external 
  ON inbox_conversations(platform, external_id);

-- Inbox Messages
CREATE INDEX idx_inbox_messages_conversation 
  ON inbox_messages(conversation_id, sent_at DESC);
CREATE INDEX idx_inbox_messages_external 
  ON inbox_messages(external_id);
CREATE INDEX idx_inbox_messages_unread 
  ON inbox_messages(conversation_id, read_at) 
  WHERE read_at IS NULL AND direction = 'inbound';

-- Inbox Blocklist
CREATE INDEX idx_inbox_blocklist_user 
  ON inbox_blocklist(user_id, platform);
CREATE INDEX idx_inbox_blocklist_participant 
  ON inbox_blocklist(platform, external_participant_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_blocklist ENABLE ROW LEVEL SECURITY;

-- Inbox Conversations: Users manage their own conversations
CREATE POLICY "Users can view their own conversations"
  ON inbox_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations"
  ON inbox_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON inbox_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON inbox_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- Inbox Messages: Users view messages for their conversations
CREATE POLICY "Users can view messages for their conversations"
  ON inbox_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inbox_conversations
      WHERE inbox_conversations.id = inbox_messages.conversation_id
      AND inbox_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages for their conversations"
  ON inbox_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inbox_conversations
      WHERE inbox_conversations.id = inbox_messages.conversation_id
      AND inbox_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update messages for their conversations"
  ON inbox_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM inbox_conversations
      WHERE inbox_conversations.id = inbox_messages.conversation_id
      AND inbox_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages for their conversations"
  ON inbox_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM inbox_conversations
      WHERE inbox_conversations.id = inbox_messages.conversation_id
      AND inbox_conversations.user_id = auth.uid()
    )
  );

-- Inbox Blocklist: Users manage their own blocklist
CREATE POLICY "Users can view their own blocklist"
  ON inbox_blocklist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own blocklist entries"
  ON inbox_blocklist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own blocklist entries"
  ON inbox_blocklist FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own blocklist entries"
  ON inbox_blocklist FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS: Auto-update timestamps
-- ============================================================================

-- Update conversations timestamp on message insert/update
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inbox_conversations
  SET 
    last_message = NEW.content,
    last_message_at = NEW.sent_at,
    updated_at = NOW(),
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_timestamp
  AFTER INSERT ON inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- ============================================================================
-- COMMENTS: Documentation
-- ============================================================================

COMMENT ON TABLE inbox_conversations IS 'Unified inbox conversations across Instagram, Facebook, WhatsApp, etc.';
COMMENT ON COLUMN inbox_conversations.external_id IS 'Platform-specific conversation/thread ID';
COMMENT ON COLUMN inbox_conversations.participant_id IS 'Platform-specific user ID of the other party';
COMMENT ON COLUMN inbox_conversations.metadata IS 'Platform-specific data: can_reply, message_tags, etc.';

COMMENT ON TABLE inbox_messages IS 'Individual messages in inbox conversations';
COMMENT ON COLUMN inbox_messages.external_id IS 'Platform-specific message ID';
COMMENT ON COLUMN inbox_messages.direction IS 'inbound = received, outbound = sent';
COMMENT ON COLUMN inbox_messages.attachments IS 'Array of media attachments with URLs and metadata';

COMMENT ON TABLE inbox_blocklist IS 'Privacy filter: hide specific contacts from the unified inbox';
COMMENT ON COLUMN inbox_blocklist.external_participant_id IS 'Platform-specific user ID to block from view';
