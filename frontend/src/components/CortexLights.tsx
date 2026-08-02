"use client";

/**
 * Lighting for the cortical surface, shared by the monitor and the gallery
 * thumbnails so the two cannot drift apart.
 *
 * Tuned against CORTEX_BASE (a light warm gray, ~0.78 linear) on a white card.
 * Ambient 1.15 plus 1.6/0.5 directionals summed to roughly 2.5x on that base,
 * and r3f applies ACES tone mapping by default, so the surface rolled off to
 * within a few percent of the card behind it: pale, low-contrast, with the
 * gyral/sulcal shading and the activation tint both washed out.
 *
 * Keep the total near 1.0 at the key highlight. The tissue color is already
 * light, so nearly all of the visible form has to come from shading rather
 * than exposure.
 */
export function CortexLights() {
  return (
    <>
      <ambientLight intensity={0.42} />
      <directionalLight position={[2, 3, 2]} intensity={0.85} />
      <directionalLight position={[-2.5, -1, -1.5]} intensity={0.3} color="#dbe6f5" />
    </>
  );
}
