-- A district's NEET answer is its county's rows, as published: a county row only
-- for a two-tier district, always with the sentence, never for an authority that
-- has rows of its own, and every live authority has exactly one answer.
select local_authority_code as problem from {{ ref('neet_area_for_la') }}
where (basis = 'county' and (figure_note is null or neet_area_code not like 'E10%' or figure_note not like 'This figure is for % County Council. NEET figures aren''t published for % on its own.'))
   or (basis = 'own' and figure_note is not null)
   or (basis = 'none' and (neet_area_code is not null or figure_note is null))
   or (basis <> 'none' and neet_area_code is null)
union all
select 'missing' from (select 1) where (select count(*) from {{ ref('neet_area_for_la') }}) <> (select count(*) from {{ ref('local_authority') }})
