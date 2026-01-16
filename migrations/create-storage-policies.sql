-- RLS Policies for videos bucket (private)
-- Users can only access their own videos (stored in user_id folder)

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own product images" ON storage.objects;

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
