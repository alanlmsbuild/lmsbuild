# National Careers Service course directory: licence notes (decision 58)

Checked 30 October 2026.

- **Licence.** Open Government Licence v3.0. The publication page
  (https://www.gov.uk/government/publications/national-careers-service-course-directory)
  says "All content is available under the Open Government Licence v3.0, except where otherwise
  stated" and states no other licence for the data files; its code tables page says "This
  publication is licensed under the terms of the Open Government Licence v3.0 except where
  otherwise stated". Publisher: Department for Education. The courses are supplied by more than
  2,700 providers (colleges, schools, training providers, local authorities); the page makes
  no separate claim for their text.
- **Attribution.** "Contains public sector information licensed under the Open Government
  Licence v3.0. National Careers Service course directory, Department for Education." Carried
  in every gold row (`attribution`), with the publication page (`source_url`) and its date
  (`published_on`).
- **Files.** Monthly (September 2026 added 14 October 2026; the page keeps the last few
  months). `Live_Courses_With_Regions_And_Venues_Report_-_20261012.csv` (96 MB, 102,861 rows,
  36 columns) and `Live_Course_Providers_Report_-_20261012.csv` (2,318 rows, 10 columns). The
  courses are those starting on or after the first day of the month before publication, and
  those with a flexible start date. Codes: the publication's code tables page defines delivery
  mode, study mode, attendance pattern, duration unit and course types 1 to 6; it does not
  define course types 7, 8 and 9 (44,000 rows; rechecked 31 October 2026), education level or
  sector. Types 7 to 9 are shown as "[Unlabelled type 7]" and so on, not guessed; education level
  and sector are kept as published with no label.
- **Cost.** The code tables page does not state the unit of `COST`. A sample of the file
  (31 October 2026) says pounds: 3500 sits beside the description "£3500 per person", 925 beside
  "prices range from £525-£925", 40 beside a £40 fee; the maximum is 29,370 (a three-year course
  at "£9790 a year"), 1,268 values carry pence as decimals. Held as published; not converted.
- **Personal data.** None is loaded (`scripts/load/ncs.js`). Left out before loading: the venue
  email address (67,000 rows) and telephone number (49,000), the venue address lines, the
  providers' contact address, telephone and email, and four free-text columns (who the course is
  for, entry requirements, how it is assessed, cost description), in which providers wrote their
  own phone numbers and email addresses (emails in 3,500 rows, phone numbers in 2,900). A web
  address that is really an email address is blanked (70 rows). The download stays in
  RAREBIT_DATA/ncs and is never staged in Snowflake. A provider that is a sole trader is listed
  under its own name (for example a person's name): the same public UKPRN register entry that
  silver `provider` already holds. Flagged for Alan on 30 October 2026; decision 31 October 2026: provider names are kept as
  published (public register, no contact details shown).
- **Contact for questions about the data:** support@coursedirectory.org.uk.
