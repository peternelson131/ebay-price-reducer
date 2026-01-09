/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark mode palette
        dark: {
          bg: '#0A0A0A',
          surface: '#141414',
          border: '#262626',
          hover: '#1F1F1F',
        },
        // Text colors
        text: {
          primary: '#FAFAFA',
          secondary: '#A1A1A1',
          tertiary: '#6B6B6B',
        },
        // Accent - keeping a blue but making it more subtle
        accent: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
          muted: '#1E3A5F',
        },
        // Status colors
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
