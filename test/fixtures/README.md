# Test fixtures

## SAMPLE-occupation-dutiesKSB.json

**A made-up sample, not real Skills England data.** Every name, code and
KSB in it is invented (the occupation code OCC9999 and standard ST9999 do
not exist).

It follows the response shape of `GET /api/v1/Occupations/{stdCode}` in the
Skills England occupational maps API's Swagger documentation
(https://occupational-maps-api.skillsengland.education.gov.uk/swagger/index.html),
requested with
`expand=occupation.dutiesKSB,occupation.products,occupation.overview,occupation.summary,occupation.maphierarchy,occupation.soc,occupation.links`.

The documentation lists the fields and their types but gives no example
values, so some details are guesses to check against a real response once
we have an API key:

- `id` fields are shown as GUIDs, and `knowledgeId` / `skillId` /
  `behaviourId` / `dutyId` as references like `K1` / `S1` / `B1` / `D1`.
- A duty's `mapped*Ids` hold the `id`s of the KSBs it relates to, and
  `mappedKnowledge` / `mappedSkills` / `mappedBehaviour` hold their text.
- The apprenticeship product's `productCode` is the ST reference (`ST9999`).

`scripts/import-ksbs.js` doesn't depend on the first two guesses: it
matches mapped KSBs by `id` first, then by reference, then by text, and
numbers KSBs K1, K2, ... by position if the references don't look like that.

Used by:

    npm run import:ksbs -- --dry-run --fixture test/fixtures/SAMPLE-occupation-dutiesKSB.json
