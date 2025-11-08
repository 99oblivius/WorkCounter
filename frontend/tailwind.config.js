export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0a0a0a',
          surface: '#1a1a1a',
          border: '#2a2a2a',
          hover: '#2f2f2f',
        },
        accent: {
          DEFAULT: 'var(--accent-color, #3b82f6)',
          light: 'var(--accent-color-light, #93c5fd)',
          hover: 'var(--accent-color-hover, #2563eb)',
        },
      },
    },
  },
  plugins: [],
}
