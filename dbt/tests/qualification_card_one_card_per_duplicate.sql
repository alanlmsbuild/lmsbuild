-- Where the register lists a card-family qualification twice (same title,
-- board and level), exactly one of the rows is shown on the cards.
select lower(title) as title, lower(board_acronym) as board, level, count_if(on_cards) as shown
from {{ ref('qualification_card') }}
where duplicate_in_register
group by 1, 2, 3
having count_if(on_cards) <> 1
