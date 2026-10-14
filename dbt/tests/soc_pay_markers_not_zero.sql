-- ASHE's not-published marks ("." and the like) never become 0: SOC_PAY has
-- exactly as many median CVs of 0 as the CV files have a literal 0.
select silver, bronze from (
  select (select count(*) from {{ ref('soc_pay') }} where median_cv = 0) as silver,
         (select count(*) from {{ source('shared_raw', 'ashe_occupation') }}
          where regexp_like(ZIPMEMBER, '.*\\.[0-9]+b +.*') and trim("Median") in ('0', '0.0')) as bronze
) where silver <> bronze
