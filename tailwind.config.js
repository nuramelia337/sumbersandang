/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: { 50: '#fff1f7', 100: '#ffe3ef', 200: '#ffc6dd', 300: '#ff94bf', 400: '#fb609c', 500: '#ed3f83', 600: '#cc1f65', 700: '#a71750', 800: '#891644', 900: '#73163c', 950: '#48071f' },
        secondary: { 50: '#fff7ed', 100: '#fcebd6', 200: '#f5d3ad', 300: '#e9ad75', 400: '#d98643', 500: '#c86a2a', 600: '#a64f21', 700: '#843c1f', 800: '#6a321f', 900: '#572b1d', 950: '#34140b' },
        accent: { 50: '#fff9eb', 100: '#ffedbf', 200: '#ffdb7a', 300: '#ffc83d', 400: '#f6ad16', 500: '#d98a08', 600: '#b86504', 700: '#934807', 800: '#79390e', 900: '#672f11', 950: '#3b1705' },
        success: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
        warning: { 50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12' },
        error: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d' },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
};
