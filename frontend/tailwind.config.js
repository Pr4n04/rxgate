/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rxgate: {
          50: '#fdf2f5',
          100: '#fce7ed',
          200: '#f9d0db',
          300: '#f4a8bd',
          400: '#ed7798',
          500: '#e24d76',
          600: '#822746',
          700: '#6a1f3a',
          800: '#5a1a32',
          900: '#4d172c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
