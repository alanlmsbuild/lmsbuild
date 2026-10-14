-- Every current code the SOC coder took from an advert's standard (method
-- standard or title-confirmed) is one of that standard's codes in
-- STANDARD_SOC: silver and the coder apply the same rule to the same
-- Skills England data. A failure means the two have drifted apart (a new
-- Skills England run since the coder last ran, or a rule change).
select v.vacancy_reference, v.lars_code, s.soc2020, s.method
from {{ ref('vacancy_soc') }} s
join {{ ref('vacancy') }} v on v.vacancy_reference = s.vacancy_reference
where s.is_current and v.is_live and s.method in ('standard', 'title-confirmed')
  and not exists (select 1 from {{ ref('standard_soc') }} t where t.lars_code = v.lars_code and t.soc2020 = s.soc2020)
