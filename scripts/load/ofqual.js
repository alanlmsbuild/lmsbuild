// The Ofqual register's awarding-organisation records carry contact details
// (22 October 2026: an email address, a phone number, often a mobile, and a
// postal address, which for a small organisation may be a home). The OGL
// doesn't cover personal data and Rarebit loads none (CLAUDE.md), and it
// doesn't need them, so they are dropped when the file is fetched and again
// when it is loaded. Kept: name, legal name, acronym, recognition number,
// both regulators' statuses and dates, website, fees URL, the record's own
// URL and when it was updated.
export const OFQUAL_PERSONAL_FIELDS = [
  'contactEmail',
  'phoneNumber',
  'addressLine1',
  'addressLine2',
  'addressCity',
  'addressCounty',
  'addressCountry',
  'addressPostCode',
]

// The record without those fields (a new object; the argument is unchanged).
export function withoutPersonalFields(record) {
  return Object.fromEntries(Object.entries(record).filter(([k]) => !OFQUAL_PERSONAL_FIELDS.includes(k)))
}
