-- Create feedback table for user feature requests, bug reports, and general feedback
-- Includes RLS policies for user-only access to their own feedback

-- Create feedback table
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('feature_request', 'bug', 'other')),
  description TEXT NOT NULL,
  screenshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_feedback_category ON public.feedback(category);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own feedback
CREATE POLICY "Users can insert own feedback" ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own feedback
CREATE POLICY "Users can view own feedback" ON public.feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Service role can view all feedback (for admin purposes)
CREATE POLICY "Service role can view all feedback" ON public.feedback
  FOR SELECT
  TO service_role
  USING (true);

-- Add comment describing the table
COMMENT ON TABLE public.feedback IS 'User feedback including feature requests, bug reports, and general feedback';
COMMENT ON COLUMN public.feedback.category IS 'Type of feedback: feature_request, bug, or other';
COMMENT ON COLUMN public.feedback.description IS 'Detailed description of the feedback';
COMMENT ON COLUMN public.feedback.screenshot_url IS 'Optional screenshot URL from storage bucket';
