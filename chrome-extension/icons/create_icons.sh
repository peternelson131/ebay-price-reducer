#!/bin/bash
# Create minimal placeholder PNGs for development

# Minimal 1x1 purple PNG (base64), then resize with sips
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > temp.png

# Create icons at different sizes
sips -z 16 16 temp.png --out icon16.png >/dev/null 2>&1
sips -z 48 48 temp.png --out icon48.png >/dev/null 2>&1
sips -z 128 128 temp.png --out icon128.png >/dev/null 2>&1

rm temp.png
echo "Created placeholder icons"
