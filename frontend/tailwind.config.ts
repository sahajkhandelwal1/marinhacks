import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-void": "var(--bg-void)",
        "bg-panel": "var(--bg-panel)",
        "bg-panel-alert": "var(--bg-panel-alert)",
        "border-hairline": "var(--border-hairline)",
        "border-alert": "var(--border-alert)",
        "text-primary": "var(--text-primary)",
        "text-muted": "var(--text-muted)",
        "accent-cyan": "var(--accent-cyan)",
        "accent-emerald": "var(--accent-emerald)",
        "accent-amber": "var(--accent-amber)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
