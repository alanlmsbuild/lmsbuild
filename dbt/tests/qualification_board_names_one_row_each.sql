-- A board has at most one display name per card family (and one default).
select board_acronym, card_family, count(*) as n
from {{ ref('qualification_board_names') }}
group by 1, 2 having count(*) > 1
