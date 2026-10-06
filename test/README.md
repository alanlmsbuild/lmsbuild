# Tests

Everything here runs against the **test** servers (API on 3002, website on
5199), never the dev servers on 3001 and 5173. Tests change only test data
(ISTESTDATA = TRUE), and the test reset (`sql/test_reset_02_reset.sql`)
puts it back.

    test/start-test-servers.sh          # API on 3002, website on 5199
    test/browser/run-all.sh             # every browser test, in order
    node test/db/pool-isolation.mjs ~/.cache/rarebit-test/api.log
    node test/db/ilr-consistency.mjs    # Record tab checks = ILR return
    node test/db/companies-house.mjs    # Companies House save, rolled back
    node test/db/refresh-companies.mjs  # the nightly refresh (after employers.mjs)
    test/stop-test-servers.py           # stops only those two servers

- `browser/` drives the real pages in headless Chromium (step3 to step4g2,
  one file per step of part 7, and `employers.mjs` for the Employers
  screens, which calls Companies House for real). `setup.mjs` has the
  shared settings.
  `restore-4g1.mjs` puts the six 4g-1 learners back to continuing; the 4g-1
  test leaves its outcomes in place for checking in FIS.
- `db/pool-isolation.mjs` proves reused database sessions never show one user
  another's learners. Start the API with `DB_POOL_MAX=1 DB_TIMING_LOG=all`
  first (see the file).
- `db/ilr-consistency.mjs` checks each learner's ILR checks on the Record tab
  match the whole return.
- `db/companies-house.mjs` saves a made-up company to EXT and an employer's
  own copy, and reads it as a manager, a tutor and another organisation, in
  a transaction that's rolled back. It doesn't call Companies House.
- `db/refresh-companies.mjs` runs the nightly refresh on the TESCO PLC test
  employers that `browser/employers.mjs` adds, calling Companies House for
  real.

Chromium needs libnspr4, libnss3 and libasound2, which this WSL setup doesn't
have. Without sudo:

    D=~/.cache/rarebit-test/chromium-libs; mkdir -p $D/debs && cd $D/debs
    apt-get download libnspr4 libnss3 libasound2t64
    for f in *.deb; do dpkg -x $f $D; done

`setup.mjs` finds them there (or set CHROMIUM_LIBS). Screenshots go to
`test/.output/screenshots` (gitignored), or the folder given to a test or
`run-all.sh`. Playwright itself:
PLAYWRIGHT_DIR and CHROMIUM_PATH, defaults in `setup.mjs`.
