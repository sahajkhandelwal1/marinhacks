/**
 * Canonical palette for code that cannot read CSS variables — canvas 2D
 * contexts and three.js materials. Mirrors the custom properties in
 * globals.css; change both together.
 *
 * Light clinical theme. The two data colors are the validated categorical
 * pair on a white chart surface: every colorblind-safety check passes
 * (worst-case CVD ΔE 24.7, normal-vision ΔE 33.6, both well clear of floor).
 */
export const THEME = {
  /** Page ground — cool off-white, one step below the cards. */
  canvas: "#F1F5F9",
  /** Card / chart surface. */
  surface: "#FFFFFF",
  /** Inset wells: track backgrounds, empty meters. */
  well: "#F8FAFC",

  rule: "#E2E8F0",
  ruleStrong: "#CBD5E1",

  ink: "#0F172A",
  ink2: "#475569",
  ink3: "#94A3B8",

  /** Surgical blue — the single accent. Data marks and active controls. */
  accent: "#2A78D6",
  /** Darker step for accent text, which needs 4.5:1 rather than 3:1. */
  accentText: "#1B5FB0",
  accentWash: "#EFF6FF",

  /** Reserved for the one status that matters: responded under anesthesia. */
  alert: "#EB6834",
  alertText: "#B4451D",
  alertWash: "#FFF3EC",
} as const;

/**
 * Resolved font family for canvas `ctx.font`.
 *
 * next/font generates a hashed family name at build time, so canvas code
 * cannot hardcode "Inter". Read it off the document once and cache — calling
 * getComputedStyle inside a render loop is a layout-thrash hazard.
 */
let cachedFont: string | null = null;

export function uiFont(): string {
  if (cachedFont) return cachedFont;
  if (typeof document === "undefined") return "system-ui, sans-serif";
  const resolved = getComputedStyle(document.body).getPropertyValue("--font-sans").trim();
  cachedFont = resolved ? `${resolved}, system-ui, sans-serif` : "system-ui, sans-serif";
  return cachedFont;
}
