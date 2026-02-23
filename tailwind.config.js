/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5ff',
          100: '#e0eaff',
          200: '#c2d5ff',
          300: '#94b4ff',
          400: '#6690ff',
          500: '#3b6cde',
          600: '#2952b8',
          700: '#1e3f8f',
          800: '#163072',
          900: '#0f2050',
        },
        sage: {
          50: '#f6f7f4',
          100: '#e8ebe3',
          200: '#d4dac8',
          300: '#b5c0a4',
          400: '#96a67f',
          500: '#7a8c63',
          600: '#5f6e4d',
          700: '#4a5740',
          800: '#3d4736',
          900: '#343d2f',
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
