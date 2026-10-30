-- A fixed start date is a real date no earlier than a year before the file was
-- downloaded and no later than five years after it; no course has both a fixed
-- start date and a flexible start; a flexible-start course has no date.
select c.course_run_id
from {{ ref('ncs_course') }} c
cross join {{ ref('ncs_feed') }} f
where (c.start_date is not null and (c.start_date < dateadd(year, -1, f.downloaded_on) or c.start_date > dateadd(year, 5, f.downloaded_on)))
   or (c.start_date is not null and c.has_flexible_start)
