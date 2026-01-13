# eBay Price Reducer - User Guide

## Overview

eBay Price Reducer is a web application that helps eBay sellers automatically manage and reduce prices on their listings to improve sales velocity.

## Key Features

| Feature | Description |
|---------|-------------|
| **Listing Management** | View and manage all your eBay listings in one place |
| **Price Reduction Strategies** | Create rules to automatically reduce prices over time |
| **Quick List** | Create new eBay listings from Amazon ASINs |
| **Influencer Central** | Find similar products and correlations |
| **eBay Sync** | Automatically sync listings from your eBay account |

## Technology Stack

- **Frontend**: React + Vite, TailwindCSS, React Query
- **Backend**: Netlify Functions (serverless)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **eBay Integration**: Trading API + Inventory API

## Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Production | https://dainty-horse-49c336.netlify.app | Live site |
| UAT | https://ebay-price-reducer-uat.netlify.app | Testing |

## Navigation

The app has the following main pages:

1. **Listings** - View and manage your eBay listings
2. **Quick List** - Create new listings from ASINs
3. **Strategies** - Manage price reduction rules
4. **Influencer Central** - Product research tools
5. **Account** - User settings and preferences
6. **API Keys** - Connect your eBay account
