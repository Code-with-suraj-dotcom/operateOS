/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: { 50: '#fdfbf6', 100: '#f8f4ea', 200: '#efe8d6' },
        ink: { 700: '#2b2838', 800: '#1d1b27', 900: '#14121b' },
        brand: { 50: '#f3effe', 100: '#e6dcfd', 500: '#7c5cf0', 600: '#6a45e0', 700: '#5733c4' },
      },
    },
  },
  plugins: [],
};
