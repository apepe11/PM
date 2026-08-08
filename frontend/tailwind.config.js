/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        petruzzi: {
          50: '#fdfbf7',
          100: '#f9f4e8',
          200: '#f2e6d1',
          300: '#e5d0b0',
          400: '#d5b387',
          500: '#be8f5a',
          600: '#a37145',
          700: '#7d5236',
          800: '#4e2a1e', // Official Petruzzi Logo Brown
          900: '#3d2017',
          950: '#26120b',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
