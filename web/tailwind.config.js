/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        background: 'var(--background)',
        text: 'var(--text)',
        error: 'var(--error)',
        success: 'var(--success)',
      },
    },
  },
  plugins: [],
} 