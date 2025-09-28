-- Complete Users Table Migration
-- This creates the single, comprehensive users table that the app expects
-- Consolidates all user data in one place for simplicity and consistency

-- Drop existing tables to start fresh (if they exist)
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- Create the complete users table with all required columns
CREATE TABLE IF NOT EXISTS public.users (
    -- Primary key
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Basic user info
    email TEXT,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),

    -- eBay integration
    ebay_user_token TEXT,
    ebay_user_id TEXT,
    ebay_token_expires_at TIMESTAMP WITH TIME ZONE,
    ebay_credentials_valid BOOLEAN DEFAULT FALSE,

    -- User preferences
    default_reduction_strategy TEXT DEFAULT 'fixed_percentage',
    default_reduction_percentage INTEGER DEFAULT 5,
    default_reduction_interval INTEGER DEFAULT 7,
    email_notifications BOOLEAN DEFAULT TRUE,
    price_reduction_alerts BOOLEAN DEFAULT TRUE,

    -- Subscription info
    subscription_plan TEXT DEFAULT 'free',
    subscription_active BOOLEAN DEFAULT TRUE,
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    listing_limit INTEGER DEFAULT 10,

    -- Account status
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,

    -- Keepa integration
    keepa_api_key TEXT
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Create trigger to automatically create user profile when new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add comments for documentation
COMMENT ON TABLE public.users IS 'Single comprehensive table for all user data including eBay and Keepa integrations';
COMMENT ON COLUMN public.users.keepa_api_key IS 'Encrypted Keepa API key for accessing Keepa services';
COMMENT ON COLUMN public.users.ebay_user_token IS 'eBay OAuth token for API access';
COMMENT ON COLUMN public.users.default_reduction_strategy IS 'Default price reduction strategy: fixed_percentage, market_based, time_based';

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.users TO anon, authenticated;