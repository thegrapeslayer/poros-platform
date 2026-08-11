/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f6f2ea",
        paper2: "#efe7d8",
        card: "#fffdf9",
        ink: "#262d27",
        muted: "#6d7268",
        line: "#ddd2bd",
        sage: { DEFAULT: "#6f8a76", dark: "#465c4c", soft: "#e6ede5" },
        gold: { DEFAULT: "#ab8a52", soft: "#f1e8d4" },
        rose: { DEFAULT: "#b06a55", soft: "#f3ded4" },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
