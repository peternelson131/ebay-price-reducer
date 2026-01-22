# Extension Icons

This directory needs icon files for the Chrome extension.

## Required Files

- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon48.png` - 48x48 pixels (extension management)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Temporary Solution

For development, you can:

1. Use placeholder images from any source
2. Use https://www.favicon-generator.org/ to create icons from text/logo
3. Design custom icons later

## Design Guidelines

- Use the brand colors: #667eea and #764ba2 (purple gradient)
- Simple, recognizable design
- Works well at small sizes
- Suggests price/shopping theme (e.g., price tag, shopping cart with arrow down)

## Quick Placeholders

You can create simple colored squares for testing:

```bash
# On macOS with ImageMagick:
convert -size 16x16 xc:'#667eea' icon16.png
convert -size 48x48 xc:'#764ba2' icon48.png
convert -size 128x128 xc:'#667eea' icon128.png
```

Or use online tools like https://placeholder.com/
