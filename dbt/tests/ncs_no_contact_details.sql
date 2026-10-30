-- No email address and no telephone number in the NCS silver tables: the
-- contact columns and the free text were left out before loading, and a web
-- address that was an email address was blanked. (A run of digits in a web
-- address is not a number.)
select 'ncs_course' as table_name, course_run_id as key
from {{ ref('ncs_course') }}
where regexp_like(coalesce(course_name, '') || ' ' || coalesce(venue_name, '') || ' ' || coalesce(venue_website, '') || ' ' || coalesce(course_url, ''),
                  '.*[A-Za-z0-9._+-]+@[A-Za-z0-9-]+\\.[A-Za-z0-9.-]+.*')
   or regexp_like(coalesce(course_name, '') || ' ' || coalesce(venue_name, ''), '.*(^|[^0-9])(0[0-9]{3,4} ?[0-9]{3} ?[0-9]{3,4}|\\+44[ 0-9]{9,}).*')
union all
select 'ncs_provider', ukprn
from {{ ref('ncs_provider') }}
where regexp_like(coalesce(provider_name, '') || ' ' || coalesce(trading_name, '') || ' ' || coalesce(website, ''),
                  '.*[A-Za-z0-9._+-]+@[A-Za-z0-9-]+\\.[A-Za-z0-9.-]+.*')
