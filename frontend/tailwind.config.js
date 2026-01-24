/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark mode palette - OpSyncPro branding
        dark: {
          bg: '#18181b',        // Updated to match logo dark background
          surface: '#1f1f23',   // Slightly lighter than bg
          border: '#2a2a2e',    // Subtle borders
          hover: '#27272a',     // Hover state
        },
        // Text colors - OpSyncPro branding
        text: {
          primary: '#f4f4f5',   // Light text from logo
          secondary: '#a1a1aa', // Refined gray
          tertiary: '#71717a',  // Muted gray from logo
        },
        // Accent - OpSyncPro orange/coral theme
        accent: {
          DEFAULT: '#f97316',   // Primary orange (was blue #3B82F6)
          hover: '#ea580c',     // Darker orange for hover
          muted: '#7c2d12',     // Muted orange for backgrounds
        },
        // Brand colors from OpSyncPro logo
        brand: {
          orange: '#f97316',    // Primary "Sync" color
          red: '#ef4444',       // Hexagon accent
          amber: '#fbbf24',     // Hexagon accent
        },
        // Status colors (semantic - unchanged)
        success: '#22C55E',
        warning: '#EAB308',
        error: '#EF4444',
        // Legacy eBay colors (for compatibility)
        ebay: {
          blue: '#0654ba',
          yellow: '#f5af02',
          red: '#e53238',
          green: '#86bd3b'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
