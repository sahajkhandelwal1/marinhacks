import type { Config } from "tailwindcss";

/**
 * Tokens mirror src/app/globals.css. Use roles in JSX, never raw hex.
 *
 * Two accent hues only (vigil-prd.md §8): a clinical green and an amber.
 * The `-deep` steps are the validated categorical pair used for data marks
 * (#199E70 / #C98500 — all six palette checks pass on the #0A0E0F chart
 * surface); the bright steps are instrument chrome: a single-series trace,
 * the hero number, the top of the topomap's one-hue sequential ramp.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "var(--void)",
        surface: "var(--surface)",
        raised: "var(--raised)",
        rule: "var(--rule)",
        "rule-bright": "var(--rule-bright)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        signal: "var(--signal)",
        "signal-deep": "var(--signal-deep)",
        alarm: "var(--alarm)",
        "alarm-deep": "var(--alarm-deep)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.9rem" }],
      },
      letterSpacing: {
        widest: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
