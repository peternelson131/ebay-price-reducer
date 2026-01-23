-- =============================================
-- Auto Thumbnail Generation Trigger
-- Migration: 20260122_thumbnail_auto_generation_trigger
-- Purpose: Automatically trigger thumbnail generation when influencer task is created with owner
-- =============================================

-- Create function to trigger thumbnail generation via HTTP webhook
CREATE OR REPLACE FUNCTION trigger_thumbnail_generation()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT;
  webhook_secret TEXT;
  http_response TEXT;
BEGIN
  -- Only trigger if:
  -- 1. Task has an ASIN
  -- 2. Task has no thumbnail yet
  -- 3. Task status is 'pending'
  IF NEW.asin IS NOT NULL AND 
     NEW.thumbnail_url IS NULL AND 
     NEW.status = 'pending' THEN
    
    -- Get webhook URL from environment (set in Supabase dashboard)
    -- Format: https://your-netlify-site.netlify.app/.netlify/functions/generate-thumbnail
    webhook_url := current_setting('app.thumbnail_webhook_url', true);
    webhook_secret := current_setting('app.webhook_secret', true);
    
    -- Only proceed if webhook URL is configured
    IF webhook_url IS NOT NULL AND webhook_url != '' THEN
      -- Use pg_net extension to make async HTTP request
      -- This requires pg_net extension to be enabled
      PERFORM net.http_post(
        url := webhook_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Webhook-Secret', COALESCE(webhook_secret, '')
        ),
        body := jsonb_build_object(
          'taskId', NEW.id::TEXT
        )
      );
      
      RAISE NOTICE 'Triggered thumbnail generation for task %', NEW.id;
    ELSE
      RAISE NOTICE 'Thumbnail webhook URL not configured, skipping auto-generation';
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to trigger thumbnail generation: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on influencer_tasks INSERT
DROP TRIGGER IF EXISTS influencer_tasks_auto_thumbnail ON influencer_tasks;
CREATE TRIGGER influencer_tasks_auto_thumbnail
  AFTER INSERT ON influencer_tasks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_thumbnail_generation();

-- Comments
COMMENT ON FUNCTION trigger_thumbnail_generation() IS 'Automatically triggers thumbnail generation webhook when influencer task is created with ASIN';
COMMENT ON TRIGGER influencer_tasks_auto_thumbnail ON influencer_tasks IS 'Calls trigger_thumbnail_generation() after INSERT to auto-generate thumbnails';

-- =============================================
-- Manual Alternative: Simpler approach without HTTP calls
-- =============================================
-- If pg_net is not available or you prefer synchronous generation,
-- you can use this simpler function that just logs and returns:

CREATE OR REPLACE FUNCTION log_thumbnail_needed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.asin IS NOT NULL AND 
     NEW.thumbnail_url IS NULL AND 
     NEW.status = 'pending' THEN
    RAISE NOTICE 'Thumbnail generation needed for task % (ASIN: %)', NEW.id, NEW.asin;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- To use the logging version instead:
-- DROP TRIGGER IF EXISTS influencer_tasks_auto_thumbnail ON influencer_tasks;
-- CREATE TRIGGER influencer_tasks_auto_thumbnail
--   AFTER INSERT ON influencer_tasks
--   FOR EACH ROW
--   EXECUTE FUNCTION log_thumbnail_needed();

-- =============================================
-- Configuration Instructions
-- =============================================
-- To enable auto-generation via HTTP webhook:
-- 1. Enable pg_net extension in Supabase dashboard
-- 2. Set configuration in Supabase SQL editor:
--    ALTER DATABASE postgres SET app.thumbnail_webhook_url = 'https://your-site.netlify.app/.netlify/functions/generate-thumbnail';
--    ALTER DATABASE postgres SET app.webhook_secret = 'your-webhook-secret';
