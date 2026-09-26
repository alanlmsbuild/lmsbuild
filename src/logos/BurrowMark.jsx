// The Burrow mark: an arched burrow entrance holding a stack of documents.
function BurrowMark({ size = 74, className }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden="true">
      <path fill="#B4532A" d="M36 176 L36 104 A64 64 0 0 1 164 104 L164 176 Z" />
      <path fill="#2A1F17" d="M60 176 L60 110 A40 40 0 0 1 140 110 L140 176 Z" />
      <rect x="82" y="108" width="44" height="34" rx="5" fill="#E9A23B" />
      <rect x="72" y="122" width="54" height="40" rx="5" fill="#FFFBF2" />
      <rect x="80" y="132" width="26" height="5" rx="2.5" fill="#B4532A" />
      <rect x="80" y="143" width="38" height="5" rx="2.5" fill="#D9C7A4" />
    </svg>
  )
}

export default BurrowMark
