-- Complete Users Table Migration
-- This creates the single, comprehensive users table that the app expects
-- Consolidates all user data in one place for simplicity and consistency
-- IMPORTANT: This will drop and recreate dependent tables due to foreign key constraints

-- Drop all dependent tables first (CASCADE will handle this but being explicit)
DROP TABLE IF EXISTS public.keepa_pricing_recommendations CASCADE;
DROP TABLE IF EXISTS public.keepa_api_usage CASCADE;
DROP TABLE IF EXISTS public.keepa_competitor_analysis CASCADE;
DROP TABLE IF EXISTS public.keepa_price_tracking CASCADE;
DROP TABLE IF EXISTS public.keepa_product_analysis CASCADE;
DROP TABLE IF EXISTS public.ebay_api_logs CASCADE;
DROP TABLE IF EXISTS public.sync_errors CASCADE;
DROP TABLE IF EXISTS public.price_history CASCADE;
DROP TABLE IF EXISTS public.listings CASCADE;
DROP TABLE IF EXISTS public.monitor_jobs CASCADE;

-- Drop existing users table and related objects
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP VIEW IF EXISTS public.user_profiles CASCADE;

-- Create the complete users table properly connected to auth.users
CREATE TABLE public.users (
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

-- Recreate essential listings table (connected to new users table)
CREATE TABLE public.listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,

    -- eBay listing data
    ebay_item_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    current_price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    category TEXT,
    category_id TEXT,
    condition TEXT,
    image_urls TEXT[],
    listing_format TEXT DEFAULT 'FixedPriceItem',
    quantity INTEGER DEFAULT 1,
    quantity_available INTEGER DEFAULT 1,
    listing_status TEXT DEFAULT 'Active',
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    view_count INTEGER DEFAULT 0,
    watch_count INTEGER DEFAULT 0,

    -- Price reduction settings
    price_reduction_enabled BOOLEAN DEFAULT FALSE,
    reduction_strategy TEXT DEFAULT 'fixed_percentage',
    reduction_percentage INTEGER DEFAULT 5,
    minimum_price DECIMAL(10,2) NOT NULL,
    reduction_interval INTEGER DEFAULT 7,
    last_price_reduction TIMESTAMP WITH TIME ZONE,
    next_price_reduction TIMESTAMP WITH TIME ZONE,

    -- Market analysis data
    market_average_price DECIMAL(10,2),
    market_lowest_price DECIMAL(10,2),
    market_highest_price DECIMAL(10,2),
    market_competitor_count INTEGER,
    last_market_analysis TIMESTAMP WITH TIME ZONE,

    -- System fields
    last_synced_with_ebay TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on listings
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Create listings policies
CREATE POLICY "Users can view own listings" ON public.listings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own listings" ON public.listings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own listings" ON public.listings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own listings" ON public.listings
    FOR DELETE USING (auth.uid() = user_id);

-- Create essential indexes
CREATE INDEX idx_listings_user_id ON public.listings(user_id);
CREATE INDEX idx_listings_ebay_item_id ON public.listings(ebay_item_id);
CREATE INDEX idx_listings_status ON public.listings(listing_status);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.users TO anon, authenticated;
GRANT ALL ON public.listings TO anon, authenticated;