-- Each lookup file in macros/onspd_lookups.sql matches exactly one file in
-- the latest postcode directory release (a renamed file would be missed).
with files as {{ onspd_release_lookup_files() }},
types (AREA_TYPE, MEMBER_LIKE, CODE_RE, NAME_RE, WELSH_RE) as ({{ onspd_lookup_values() }})
select t.AREA_TYPE, t.MEMBER_LIKE, count(f.MEMBER) as files_
from types t left join files f on f.MEMBER like t.MEMBER_LIKE
group by 1, 2
having count(f.MEMBER) <> 1
