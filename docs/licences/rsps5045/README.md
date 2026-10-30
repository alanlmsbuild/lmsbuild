# RSPS5045: Fares and Associated Data Feed Interface Specification

Version P-02-04, dated 22 April 2026, 70 pages, Rail Settlement Plan Limited.
Downloaded 30 October 2026 from
https://www.rspaccreditation.org/publicDocumentation.php (the link on RDG's fares
data page), as "RSPS5045 P-02-04 Fares and Associated Data Feed Interface
Specification.pdf". It replaces P-02-03 (3 June 2025), which decision 19 names.

It is the record layout (fixed-width fields, positions) of the RJFAF fares feed
loaded in `SHARED_DB.RAW.RDG_FARES_LINE`. The silver train fares models
(`dbt/models/silver/areas/rdg_*.sql`) are written from it; each says which
section it follows. Checked against the loaded feed (RJFAF924, 21 October 2026):
a flow line `RFQ349R03200430000AR3112299927072026IEC10Y0375406` reads as update
marker R, record type F, origin Q349, destination R032, route 00430, status 000,
usage A, direction R, end 31122999, start 27072026, TOC IEC, cross London 1,
non-standard discounts 0, published Y, flow ID 0375406 (section 4.1.2).
