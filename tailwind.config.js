/** @type {import('tailwindcss').Config} */

// The brand scale is read from CSS variables rather than fixed hex values, so
// the accent picker in Settings still recolours the whole app. ThemeContext
// writes the channels for whichever accent is chosen; violet is the default
// and is what the public pages always use.
const brand = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
    step, `rgb(var(--brand-${step}) / <alpha-value>)`,
  ]),
)

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand,
        accent: 'var(--accent)',
      },
    },
  },
  plugins: [],
}
