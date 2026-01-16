-- Create storage buckets for eBay Price Reducer
-- Videos: private bucket with RLS (requires auth)
-- Product Images: public bucket (anyone can access URLs)

-- Create private bucket for videos (500MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  false,
  524288000,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

-- Create public bucket for product images (10MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- RLS Policies for videos bucket (private)
-- Users can only access their own videos (stored in user_id folder)

-- Allow authenticated users to upload videos to their own folder
CREATE POLICY "Users can upload own videos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to view their own videos
CREATE POLICY "Users can view own videos" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to update their own videos
CREATE POLICY "Users can update own videos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own videos
CREATE POLICY "Users can delete own videos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS Policies for product-images bucket (public)
-- Anyone can view, but only authenticated users can upload to their folder

-- Allow anyone to view product images (public bucket)
CREATE POLICY "Anyone can view product images" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'product-images');

-- Allow authenticated users to upload product images to their folder
CREATE POLICY "Users can upload product images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own product images
CREATE POLICY "Users can delete own product images" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
