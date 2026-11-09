/**
 * The SVG asset of the composition of SVG assets (D74): a badge of 160 x 120
 * drawn with every kind of shape of the subset — a rounded rectangle filled
 * with a linear gradient and stroked on its edge, a circle with a radial
 * gradient, a star in a turned group, an open curve, and a skewed ellipse —
 * written as ASCII text, so its bytes are its UTF-8 and the same everywhere.
 */
export const SVG_BADGE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">
  <title>Kadrion test badge</title>
  <defs>
    <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="160" y2="120">
      <stop offset="0" stop-color="#7a5af8"/>
      <stop offset="1" stop-color="#ee46bc"/>
    </linearGradient>
    <radialGradient id="sun" gradientUnits="userSpaceOnUse" cx="112" cy="40" r="22">
      <stop offset="0" stop-color="#fef0c7"/>
      <stop offset="1" stop-color="#f79009"/>
    </radialGradient>
  </defs>
  <rect x="4" y="4" width="152" height="112" rx="16" fill="url(#sky)" stroke="#ffffff" stroke-width="4"/>
  <circle cx="112" cy="40" r="20" fill="url(#sun)"/>
  <g transform="translate(40 66) rotate(-10)" fill="#12b76a" stroke="#0b1020" stroke-width="3" stroke-linejoin="round">
    <polygon points="0,-28 8,-9 28,-9 12,4 18,24 0,12 -18,24 -12,4 -28,-9 -8,-9"/>
  </g>
  <path d="M10 100 C 40 80, 70 120, 100 96 S 140 90, 150 104" fill="none" stroke="#fdb022" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="140" cy="88" rx="18" ry="8" fill="#155eef" opacity="0.8" transform="skewX(-15)"/>
</svg>
`;

/** The natural size of the badge, its root's width and height. */
export const SVG_BADGE_SIZE = Object.freeze({ width: 160, height: 120 });

/** The bytes of the badge: its text is ASCII, so each character is one byte. */
export function generateSvg(): Uint8Array {
  return Uint8Array.from(SVG_BADGE, (character) => character.charCodeAt(0));
}
