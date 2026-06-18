/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Universal theme tokens — change in src/index.css :root to affect globally
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'text-sec': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        border: 'var(--border)',
      },
      borderRadius: {
        'xl': 'var(--radius)',
        '2xl': 'var(--radius-lg)',
      },
      boxShadow: {
        'glow': 'var(--shadow-glow)',
        'card': 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}