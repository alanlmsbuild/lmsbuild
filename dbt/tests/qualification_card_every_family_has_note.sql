{{ config(severity='warn') }}
-- Every card family and level on the cards should have a checked
-- explanation in qualification_family_notes (written by hand, never
-- generated). A note with a blank level covers every level of its family.
-- Warns, listing the families and levels still without one.
select f.card_family, f.level
from (select distinct card_family, level from {{ ref('qualification_card') }} where on_cards) f
left join {{ ref('qualification_family_notes') }} n
  on n.card_family = f.card_family and (n.level = f.level or n.level is null)
  and n.checked_by is not null and n.checked_on is not null
where n.card_family is null
