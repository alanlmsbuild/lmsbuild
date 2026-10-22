{{ config(severity='warn') }}
-- Every card family on the cards should have a checked explanation in
-- qualification_family_notes (written by hand, never generated). Warns,
-- listing the families still without one.
select f.card_family
from (select distinct card_family from {{ ref('qualification_card') }} where on_cards) f
left join {{ ref('qualification_family_notes') }} n
  on n.card_family = f.card_family and n.checked_by is not null and n.checked_on is not null
where n.card_family is null
