-- VACANCY and VACANCY_SOC have one row per row of SHARED_DB.EXT.VACANCY and
-- VACANCY_SOC (gone adverts and gone codes included), and each advert's
-- SOC_CODES and SOC_COUNT are exactly its current codes.
select 'vacancy rows' as check_, (select count(*) from {{ ref('vacancy') }}) as silver, (select count(*) from {{ source('shared_ext', 'vacancy') }}) as bronze
where (select count(*) from {{ ref('vacancy') }}) <> (select count(*) from {{ source('shared_ext', 'vacancy') }})
union all
select 'vacancy_soc rows', (select count(*) from {{ ref('vacancy_soc') }}), (select count(*) from {{ source('shared_ext', 'vacancy_soc') }})
where (select count(*) from {{ ref('vacancy_soc') }}) <> (select count(*) from {{ source('shared_ext', 'vacancy_soc') }})
union all
select 'adverts whose soc_codes are not their current codes', count(*), 0
from {{ ref('vacancy') }} v
left join (select vacancy_reference, listagg(soc2020, ',') within group (order by soc2020) as codes, count(*) as n
           from {{ ref('vacancy_soc') }} where is_current group by 1) c on c.vacancy_reference = v.vacancy_reference
where coalesce(v.soc_codes, '') <> coalesce(c.codes, '') or v.soc_count <> coalesce(c.n, 0)
having count(*) > 0
