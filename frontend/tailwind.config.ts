import type { Config } from "tailwindcss";

/**
 * Tokens mirror src/app/globals.css and src/lib/theme.ts. Use roles in JSX,
 * never raw hex.
 *
 * One accent hue (surgical blue) plus one reserved status hue (amber). That
 * pair is the validated categorical pair for data marks on the white chart
 * surface; the `-text` steps are darker variants that clear 4.5:1 for small
 * type, since the mark colors only clear 3:1.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        well: "var(--well)",
        rule: "var(--rule)",
        "rule-strong": "var(--rule-strong)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        accent: "var(--accent)",
        "accent-text": "var(--accent-text)",
        "accent-wash": "var(--accent-wash)",
        alert: "var(--alert)",
        "alert-text": "var(--alert-text)",
        "alert-wash": "var(--alert-wash)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.9rem" }],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
      },
      borderRadius: {
        panel: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
