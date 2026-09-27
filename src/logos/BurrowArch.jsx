// The Burrow header logo from the approved designs: a clay arch with a
// document inside, used as-is. (The landing page's product badge is a
// slightly different drawing, BurrowMark.)
function BurrowArch({ size = 36 }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
      <path fill="#B4532A" d="M36 176 L36 104 A64 64 0 0 1 164 104 L164 176 Z" />
      <path fill="#2A1F17" d="M60 176 L60 110 A40 40 0 0 1 140 110 L140 176 Z" />
      <rect x="82" y="108" width="44" height="34" rx="5" fill="#E9A23B" />
      <rect x="72" y="122" width="54" height="40" rx="5" fill="#F9E9C8" />
    </svg>
  )
}

export default BurrowArch
