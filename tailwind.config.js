/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Wherelse Brand Colors
        wherelse: {
          olive: '#87876F',
          'olive-dark': '#6B6B55',
          yellow: '#F7D400',
          'yellow-light': '#FFE135',
          cream: '#F7F3E9',
          sand: '#EBCFAA',
          gray: '#A6A6A6',
          'gray-light': '#C4C4B8',
          blue: '#5B7BC0',
          'blue-dark': '#4A6AAF',
          charcoal: '#52504A',
          'charcoal-dark': '#3D3B36',
          red: '#C94242',
          'red-light': '#D34040',
        }
      },
      fontFamily: {
        'display': ['Instrument Serif', 'Georgia', 'serif'],
        'condensed': ['Barlow Condensed', 'sans-serif'],
        'body': ['DM Sans', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      letterSpacing: {
        'widest': '0.25em',
        'ultra': '0.35em',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.4s ease-out forwards',
      },
    },
  },
  plugins: [],
}
