-- Create storage bucket for feedback screenshots
-- Authenticated users can upload/view, max 5MB, image types only

-- Create the feedback-screenshots bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  false,  -- Private bucket, access controlled via RLS
  5242880,  -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

-- RLS Policies for feedback-screenshots bucket

-- Allow authenticated users to upload screenshots to their own folder
-- Files should be stored as: {user_id}/{filename}
CREATE POLICY "Users can upload feedback screenshots" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'feedback-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to view their own screenshots
CREATE POLICY "Users can view own feedback screenshots" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own screenshots
CREATE POLICY "Users can delete own feedback screenshots" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow service role to access all screenshots (for admin viewing)
CREATE POLICY "Service role can view all feedback screenshots" ON storage.objects
FOR SELECT TO service_role
USING (bucket_id = 'feedback-screenshots');
