/**
 * Clay3D — pure SVG clay-style illustration in the brand palette.
 * Used as the decorative element in the assistant hero card.
 */
export function Clay3D({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <defs>
        <radialGradient id="c3d-lavender" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#cfc0ff" />
          <stop offset="100%" stopColor="#9b87f5" />
        </radialGradient>
        <radialGradient id="c3d-peach" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#ffd0a0" />
          <stop offset="100%" stopColor="#f59a50" />
        </radialGradient>
        <radialGradient id="c3d-mint" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#d4f0da" />
          <stop offset="100%" stopColor="#8ecf9a" />
        </radialGradient>
        <radialGradient id="c3d-sky" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#cce4ff" />
          <stop offset="100%" stopColor="#7ab8f5" />
        </radialGradient>
        <filter id="c3d-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="4" stdDeviation="4" floodColor="#0d101b" floodOpacity="0.15" />
        </filter>
      </defs>

      <ellipse cx="80" cy="148" rx="44" ry="6" fill="#0d101b" opacity="0.06" />

      {/* Large back sphere — lavender */}
      <circle cx="92" cy="88" r="44" fill="url(#c3d-lavender)" filter="url(#c3d-shadow)" />
      <ellipse cx="78" cy="70" rx="14" ry="9" fill="white" opacity="0.28" transform="rotate(-20 78 70)" />

      {/* Mid sphere — peach */}
      <circle cx="50" cy="106" r="28" fill="url(#c3d-peach)" filter="url(#c3d-shadow)" />
      <ellipse cx="40" cy="94" rx="9" ry="6" fill="white" opacity="0.28" transform="rotate(-15 40 94)" />

      {/* Tiny sphere — sky */}
      <circle cx="44" cy="56" r="14" fill="url(#c3d-sky)" filter="url(#c3d-shadow)" />
      <ellipse cx="38" cy="50" rx="4" ry="3" fill="white" opacity="0.32" transform="rotate(-20 38 50)" />

      {/* Tiny sphere — mint */}
      <circle cx="124" cy="118" r="11" fill="url(#c3d-mint)" filter="url(#c3d-shadow)" />
    </svg>
  );
}
