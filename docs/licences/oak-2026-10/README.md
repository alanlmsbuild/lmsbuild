# Oak National Academy: licence notes (decision 56)

Checked 26 to 30 October 2026.

- **Licence.** The Oak Curriculum API and bulk download are published under the Open
  Government Licence v3.0 "except where otherwise stated". Oak marks a lesson `restricted`
  when it contains third-party content (the bulk file's `restricted` flag; the API's
  `check-restricted` endpoints say "restricted" or "ogl-compatible"). The bulk flag
  is NOT reliable (found 30 October): many unflagged lessons are restricted by Oak's
  check, so Rarebit keeps a lesson open only if the flag is unset and the check says
  "ogl-compatible". On that rule 2,919 distinct lessons are open (the full fetch of the 17
  subjects has 8,425 lesson rows). Art, English, French, geography, German, music,
  religious education and Spanish have none.
- **Attribution.** "A [subject] lesson by Oak National Academy licensed under Open Government
  Licence (OGL)" with a link to https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
  (Oak's terms: https://www.thenational.academy/legal/terms-and-conditions-api-version and
  https://support.thenational.academy/a-guide-to-our-website-licensing). Carried through
  silver and gold with each lesson.
- **Restricted lessons.** Oak confirmed by email on 27 October 2026
  (`docs/licences/emails-2026-10.md`) that storing the lesson and unit titles, exam board
  and slug of restricted lessons, to link students to Oak's website, is fine: "The
  information you have listed to store is not restricted." Rarebit therefore keeps only
  those, with the sequence name, and nothing else of a restricted lesson. A unit that has no
  open lesson also loses its description, prior knowledge, national curriculum content and
  rationale (the email did not mention them). The raw download is read from a temporary
  folder, filtered and deleted: it is never staged in Snowflake or kept.
- **Quizzes.** Fetched from the API for open lessons only. A question with an image on the
  question or on any answer is left out for now (images are on Oak's CDN, and showing one
  would mean the app calling Oak's servers; about 4,800 of 32,100 questions, mostly maths).
  29 of about 4,500 images in open lessons also carry a third-party attribution string
  (for example "© Bowler Hat LLC"), another reason to leave images out until there is a plan
  for them.
- **The app never calls Oak.** The options app reads Rarebit's gold tables only. The key
  (`OAK_API_KEY`, `server/.env`, never committed) is used by the fetch on the laptop. Links
  to Oak's website for a lesson (`https://www.thenational.academy/teachers/lessons/<slug>`)
  are ordinary links the student follows, not calls by the app.
- **Limits.** 1,000 API requests an hour per key; the fetch uses one bulk request per
  subject (17) and, later, about 125 for the quizzes, with pauses.
