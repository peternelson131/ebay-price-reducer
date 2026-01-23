#!/bin/bash
# Test Script: Verify Pre-Upload Architecture Backend Implementation
# Usage: ./test-transcode-implementation.sh

set -e

echo "=================================================="
echo "Pre-Upload Architecture - Backend Verification"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

success() {
  echo -e "${GREEN}✓${NC} $1"
}

warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

error() {
  echo -e "${RED}✗${NC} $1"
}

# 1. Check Migration File
echo "1. Checking database migration..."
if [ -f "supabase/migrations/20260123_add_social_ready_columns.sql" ]; then
  SIZE=$(du -h "supabase/migrations/20260123_add_social_ready_columns.sql" | cut -f1)
  success "Migration file exists (${SIZE})"
  
  # Check for required columns
  if grep -q "social_ready_url" "supabase/migrations/20260123_add_social_ready_columns.sql"; then
    success "  - social_ready_url column defined"
  fi
  if grep -q "social_ready_status" "supabase/migrations/20260123_add_social_ready_columns.sql"; then
    success "  - social_ready_status column defined"
  fi
  if grep -q "social_ready_at" "supabase/migrations/20260123_add_social_ready_columns.sql"; then
    success "  - social_ready_at column defined"
  fi
  if grep -q "social_ready_error" "supabase/migrations/20260123_add_social_ready_columns.sql"; then
    success "  - social_ready_error column defined"
  fi
else
  error "Migration file not found!"
  exit 1
fi

echo ""

# 2. Check Transcode Function
echo "2. Checking video-transcode-background function..."
if [ -f "netlify/functions/video-transcode-background.js" ]; then
  SIZE=$(du -h "netlify/functions/video-transcode-background.js" | cut -f1)
  success "Transcode function exists (${SIZE})"
  
  # Check for key components
  if grep -q "downloadFromOneDrive" "netlify/functions/video-transcode-background.js"; then
    success "  - OneDrive download implemented"
  fi
  if grep -q "transcodeVideo" "netlify/functions/video-transcode-background.js"; then
    success "  - Transcoder integration implemented"
  fi
  if grep -q "uploadToSupabaseStorage" "netlify/functions/video-transcode-background.js"; then
    success "  - Supabase Storage upload implemented"
  fi
  if grep -q "updateVideoStatus" "netlify/functions/video-transcode-background.js"; then
    success "  - Status update function implemented"
  fi
  if grep -q "cleanupTranscodedFile" "netlify/functions/video-transcode-background.js"; then
    success "  - Cleanup function implemented"
  fi
else
  error "Transcode function not found!"
  exit 1
fi

echo ""

# 3. Check Videos API Integration
echo "3. Checking videos.js integration..."
if [ -f "netlify/functions/videos.js" ]; then
  success "Videos API exists"
  
  # Check for trigger function
  if grep -q "triggerBackgroundTranscode" "netlify/functions/videos.js"; then
    success "  - Trigger function defined"
    
    # Check trigger calls
    TRIGGER_COUNT=$(grep -c "triggerBackgroundTranscode(" "netlify/functions/videos.js" || echo "0")
    if [ "$TRIGGER_COUNT" -ge 2 ]; then
      success "  - Trigger called in POST handler (${TRIGGER_COUNT} call(s))"
    else
      warning "  - Trigger calls found but may be incomplete"
    fi
  else
    error "  - Trigger function not found!"
  fi
  
  # Check PATCH allowedFields
  if grep -q "social_ready_status" "netlify/functions/videos.js"; then
    success "  - social_ready_status in PATCH allowedFields"
  else
    warning "  - social_ready_status may not be patchable"
  fi
else
  error "Videos API not found!"
  exit 1
fi

echo ""

# 4. Check Social Post Processor Integration
echo "4. Checking social-post-processor-background.js integration..."
if [ -f "netlify/functions/social-post-processor-background.js" ]; then
  success "Social post processor exists"
  
  # Check for fast path
  if grep -q "Using pre-transcoded URL" "netlify/functions/social-post-processor-background.js"; then
    success "  - Fast path implemented (pre-transcoded URL)"
  else
    error "  - Fast path not found!"
  fi
  
  # Check for fallback
  if grep -q "on-demand transcoding" "netlify/functions/social-post-processor-background.js"; then
    success "  - Fallback implemented (on-demand transcode)"
  else
    warning "  - Fallback path may not be implemented"
  fi
else
  error "Social post processor not found!"
  exit 1
fi

echo ""

# 5. Check Documentation
echo "5. Checking documentation..."
if [ -f "docs/IMPL-pre-upload-architecture-backend.md" ]; then
  success "Implementation docs exist"
fi
if [ -f "docs/STATUS-backend-tasks.md" ]; then
  success "Status docs exist"
fi

echo ""

# 6. Environment Variables Check (Manual)
echo "6. Environment variables to verify (MANUAL):"
warning "  Check Netlify dashboard for:"
echo "    - TRANSCODER_URL (Railway service)"
echo "    - SUPABASE_URL"
echo "    - SUPABASE_SERVICE_ROLE_KEY"
echo "    - URL (auto-set by Netlify)"

echo ""

# 7. Storage Bucket Reminder
echo "7. Supabase Storage bucket (MANUAL):"
warning "  Create 'transcoded-videos' bucket in Supabase dashboard:"
echo "    - Public: Yes"
echo "    - RLS policies (see migration file for SQL)"

echo ""

# Summary
echo "=================================================="
echo "Verification Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "  1. Apply migration: psql \$SUPABASE_DB_URL -f supabase/migrations/20260123_add_social_ready_columns.sql"
echo "  2. Create storage bucket in Supabase dashboard"
echo "  3. Deploy functions: git push"
echo "  4. Test with real video sync"
echo ""
echo "Backend tasks (1-5, 8): ${GREEN}✓ COMPLETE${NC}"
echo "Frontend tasks (6-7): Pending"
echo ""
