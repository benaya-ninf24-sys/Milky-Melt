import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#402c34",
        rose: "#d86e91",
        "rose-deep": "#b94f73",
        blush: "#fff1f4",
        cream: "#fffaf6",
        lilac: "#eee5f7",
        butter: "#fff1c8",
        mint: "#e5f4ed"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(153, 77, 104, 0.12)",
        card: "0 8px 24px rgba(153, 77, 104, 0.08)"
      },
      fontFamily: {
        sans: ["Trebuchet MS", "Segoe UI", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
}

export default config
