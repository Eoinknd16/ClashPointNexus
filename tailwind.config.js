/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // rgb(var(--x) / <alpha-value>) is the standard pattern for
        // CSS-variable-backed Tailwind colors that still support opacity
        // modifiers (bg-surface/95 etc.) — see themes/builtInThemes.ts,
        // which is what actually sets these variables at runtime.
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-hi': 'rgb(var(--color-surface-hi) / <alpha-value>)',
        'surface-hover': 'rgb(var(--color-surface-hover) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-2': 'rgb(var(--color-accent-2) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        focus: 'var(--shadow-focus)',
        panel: 'var(--shadow-panel)'
      },
      backgroundImage: {
        'app-glow': 'var(--gradient-app-glow)',
        'accent-gradient': 'var(--gradient-accent)'
      }
    }
  },
  plugins: []
}
