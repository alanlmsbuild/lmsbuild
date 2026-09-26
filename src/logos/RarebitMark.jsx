// The Rarebit mark: a slice of toast with rabbit ears and a cheddar top.
// Decorative only - it always sits next to the word "rarebit".
function RarebitMark({ size = 52, className }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden="true">
      <path
        fill="#9A5B2B"
        d="M52 184 Q40 184 40 172 L40 100 C40 88 46 80 54 76 C50 50 56 22 70 18 C84 14 90 44 90 74 Q100 70 110 74 C110 44 116 14 130 18 C144 22 150 50 146 76 C154 80 160 88 160 100 L160 172 Q160 184 148 184 Z"
      />
      <ellipse cx="71" cy="50" rx="7" ry="22" fill="#F9E9C8" />
      <ellipse cx="129" cy="50" rx="7" ry="22" fill="#F9E9C8" />
      <rect x="52" y="92" width="96" height="80" rx="10" fill="#F9E9C8" />
      <path
        fill="#E9A23B"
        d="M52 102 Q52 92 62 92 L138 92 Q148 92 148 102 L148 116 C148 122 140 122 140 116 L140 112 L120 112 L120 132 C120 140 108 140 108 132 L108 112 L82 112 L82 122 C82 129 70 129 70 122 L70 112 L62 112 Q52 112 52 104 Z"
      />
      <circle cx="86" cy="150" r="5" fill="#2A1F17" />
      <circle cx="114" cy="150" r="5" fill="#2A1F17" />
    </svg>
  )
}

export default RarebitMark
