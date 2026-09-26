// The Warren mark: a zigzag of burrow entrances with cheddar centres. The
// same drawing as src/assets/warren-mark.svg, which the app header and
// favicon use.
const POINTS = [
  [30, 60],
  [65, 146],
  [100, 86],
  [135, 146],
  [170, 60],
]

function WarrenMark({ size = 70, className }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden="true">
      <path
        d="M30 60 L65 146 L100 86 L135 146 L170 60"
        fill="none"
        stroke="#2E5A4C"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {POINTS.map(([cx, cy]) => (
        <circle key={`outer-${cx}`} cx={cx} cy={cy} r="18" fill="#2E5A4C" />
      ))}
      {POINTS.map(([cx, cy]) => (
        <circle key={`inner-${cx}`} cx={cx} cy={cy} r="8" fill="#E9A23B" />
      ))}
    </svg>
  )
}

export default WarrenMark
