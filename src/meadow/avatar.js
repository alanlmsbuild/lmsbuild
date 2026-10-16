// The colour of a person's initials circle, the same on the board and on
// their record (picked from their lead ID).
const AVATARS = ['#3f5683', '#5c74a6', '#2b3d60', '#55699a', '#4a6293']

export function avatarColour(id) {
  let n = 0
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  return AVATARS[n % AVATARS.length]
}
