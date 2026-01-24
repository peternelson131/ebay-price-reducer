#!/usr/bin/env node

/**
 * Generate OpSyncPro icon PNGs from SVG
 * This script creates a simple colored icon for the extension
 */

const fs = require('fs');
const path = require('path');

// Since we don't have canvas or sharp installed, we'll create a simple placeholder
// that Pete can replace with proper icons later, or use the HTML method

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 65" width="65" height="65">
  <!-- OpSyncPro.io - Icon Only -->
  <g transform="translate(5, 5)">
    <polygon points="25,5 35,10 35,22 25,27 15,22 15,10" fill="#f97316" opacity="0.9"/>
    <polygon points="40,14 50,19 50,31 40,36 30,31 30,19" fill="#ef4444"/>
    <polygon points="25,28 35,33 35,45 25,50 15,45 15,33" fill="#fbbf24"/>
    <polygon points="40,37 50,42 50,54 40,59 30,54 30,42" fill="#f97316" opacity="0.6"/>
    <line x1="30" y1="16" x2="35" y2="22" stroke="#fff" stroke-width="1" opacity="0.4"/>
    <line x1="30" y1="27" x2="35" y2="33" stroke="#fff" stroke-width="1" opacity="0.4"/>
  </g>
</svg>`;

// Save the SVG for manual conversion
fs.writeFileSync(path.join(__dirname, 'opsyncpro-icon.svg'), svgIcon);

console.log('✅ Created opsyncpro-icon.svg');
console.log('');
console.log('📝 To create PNG icons, use one of these methods:');
console.log('');
console.log('Method 1: Use the HTML converter');
console.log('  1. Open convert_logo.html in a browser');
console.log('  2. Right-click each canvas and "Save Image As..."');
console.log('  3. Save as icon16.png, icon48.png, and icon128.png');
console.log('');
console.log('Method 2: Use online SVG to PNG converter');
console.log('  1. Go to https://cloudconvert.com/svg-to-png');
console.log('  2. Upload opsyncpro-icon.svg');
console.log('  3. Convert to PNG at sizes: 16x16, 48x48, 128x128');
console.log('');
console.log('Method 3: Use ImageMagick (if installed)');
console.log('  convert -background none -resize 16x16 opsyncpro-icon.svg icon16.png');
console.log('  convert -background none -resize 48x48 opsyncpro-icon.svg icon48.png');
console.log('  convert -background none -resize 128x128 opsyncpro-icon.svg icon128.png');
console.log('');
