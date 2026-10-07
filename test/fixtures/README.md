# Test fixtures

## skills/

Saved Skills England responses, used by `test/db/skills-import.mjs`. Real
data: © Skills England 2025. This information is licensed under the Open
Government Licence
https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

- `standards.json`: three records from the standards API
  (https://skillsengland.education.gov.uk/api/apprenticeshipstandards):
  ST0072 1.0 (no KSBs published) and 1.1, and ST1312 1.0 (duties and
  options).
- `occupations.json`: the occupational maps API's answer for two occupation
  codes, as `{ code: { status, body } }`: OCC0072 (200) and OCC1312 (404,
  as the live API gives).

## faa/

`adverts.json`: saved Find an apprenticeship responses, used by
`test/db/vacancy-import.mjs`.
