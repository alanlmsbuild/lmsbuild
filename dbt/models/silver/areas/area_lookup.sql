-- Area codes and their names, from the postcode directory's lookup files
-- (macros/onspd_lookups.sql), one row per area type and code. A row the
-- ONS repeats word for word in a file is kept once (W45001083 Bargod is in
-- the 2024 built-up area file twice); a code with two different names
-- would fail the unique test.
with types (AREA_TYPE, MEMBER_LIKE, CODE_RE, NAME_RE, WELSH_RE) as (
  {{ onspd_lookup_values() }}
),
files as {{ onspd_release_lookup_files() }},
cells as (
  select t.AREA_TYPE, t.CODE_RE, t.NAME_RE, t.WELSH_RE, f.MEMBER, c.SOURCEFILEID, c.SHEETROW, c.HEADER, c.VALUE
  from types t
  join files f on f.MEMBER like t.MEMBER_LIKE
  join {{ source('shared_raw', 'published_cell') }} c on c.SOURCEFILEID = f.SOURCEFILEID and c.SHEETROW <> c.HEADERROW
)
select distinct
  AREA_TYPE::varchar as area_type,
  max(case when regexp_like(HEADER, CODE_RE) then VALUE end)::varchar as code,
  max(case when regexp_like(HEADER, NAME_RE) then VALUE end)::varchar as name,
  nullif(max(case when regexp_like(HEADER, WELSH_RE) then VALUE end), '')::varchar as name_welsh,
  regexp_replace(MEMBER, '^Documents/', '')::varchar as lookup_file,
  SOURCEFILEID::varchar as source_file_id
from cells
group by AREA_TYPE, MEMBER, SOURCEFILEID, SHEETROW
