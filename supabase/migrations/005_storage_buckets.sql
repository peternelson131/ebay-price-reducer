-- Create storage bucket for dubbed videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dubbed-videos',
  'dubbed-videos',
  false,  -- Private bucket, requires auth
  524288000,  -- 500MB max file size
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4'];

-- Storage policies for dubbed-videos bucket

-- Users can read their own files
CREATE POLICY "Users can read own dubbed videos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'dubbed-videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can upload to their own folder
CREATE POLICY "Users can upload dubbed videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'dubbed-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own files
CREATE POLICY "Users can delete own dubbed videos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'dubbed-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Service role can do anything (for cleanup)
CREATE POLICY "Service role full storage access"
ON storage.objects FOR ALL
USING (
  bucket_id = 'dubbed-videos'
  AND auth.role() = 'service_role'
);
