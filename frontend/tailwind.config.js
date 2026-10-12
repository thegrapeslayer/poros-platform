/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f5f5f7",
        paper2: "#eceef4",
        card: "#ffffff",
        ink: "#1d1d24",
        muted: "#646675",
        line: "#dedee7",
        sage: { DEFAULT: "#4567e8", dark: "#304cc5", soft: "#edf0ff" },
        gold: { DEFAULT: "#a76716", soft: "#fff4dd" },
        rose: { DEFAULT: "#b74a61", soft: "#fff0f3" },
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

