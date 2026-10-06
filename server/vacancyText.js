// Advert text from Find an apprenticeship (vacancies build step 2). Adverts
// arrive with HTML in their descriptions. Until a proper cleaner exists,
// Warren keeps none of it as HTML: the import turns every text field into
// plain text before it reaches EXT.VACANCY (RAW keeps the response exactly
// as returned), and pages show it as text. Links are kept only if they're
// http or https.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', pound: '£', hellip: '…', bull: '•' }

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

// Plain text from an advert's HTML (or text): scripts, styles and comments
// go entirely; paragraphs, line breaks and list items become new lines;
// every other tag is dropped; entities are decoded. What's left is text,
// and anything that looks like a tag in it (from "&lt;script&gt;") is just
// characters, shown as such. Null stays null.
export function htmlToText(value) {
  if (value === null || value === undefined) return null
  let text = String(value)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|template|noscript)\b[^>]*\/?>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|ul|ol|h[1-6]|tr|table|section|blockquote)\s*>/gi, '\n')
    .replace(/<(p|div|ul|ol|h[1-6]|tr|table|section|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
  text = decodeEntities(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text === '' ? null : text
}

// A link from an advert, only if it's an absolute http or https URL (never
// javascript: or data:). Null otherwise.
export function safeUrl(value) {
  if (!value) return null
  try {
    const url = new URL(String(value).trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
