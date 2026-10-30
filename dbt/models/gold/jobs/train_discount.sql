-- The discounts the feed publishes for train fares (decision 19, phase C):
-- the child fare, the 16-17 Saver and the 16-25 Railcard, for each kind of
-- ticket, as the percentage off the adult fare in the feed's own discount
-- tables (National Rail Enquiries terms v3.0: discounts only through the
-- feed's own tables). No discounted price is worked out: the feed's rounding
-- rules are withdrawn, so a price would be Rarebit's, not the feed's. Only a
-- plain percentage (indicator 0) is shown; a discount the feed gives as a flat
-- fare, a maximum or a minimum, or not at all, has no row. The railcards are
-- for single and return tickets only, not seasons (Rarebit's choice: a season
-- is not shown with a railcard discount).
with whos as (
  select 'child' as who, 'Child' as who_label, '001' as status_code
  union all
  select 'saver-16-17', '16-17 Saver', adult_status from {{ ref('rdg_railcard') }} where railcard_code = 'TSU'
  union all
  select 'railcard-16-25', '16-25 Railcard', adult_status from {{ ref('rdg_railcard') }} where railcard_code = 'YNG'
)
select
  (w.who || '|' || k.kind)::varchar as discount_key,
  w.who::varchar as who,
  w.who_label::varchar as who_label,
  k.kind::varchar as kind,
  k.label::varchar as kind_label,
  d.percentage::number(4,1) as percentage,
  (regexp_replace(to_varchar(d.percentage, 'FM990.0'), '\\.0$', '') || '% off the adult fare (from the discount table)')::varchar as discount_text,
  feed.feed::varchar as feed,
  feed.published_on::date as published_on,
  current_date()::date as built_on
from whos w
cross join {{ ref('train_ticket_kind') }} k
join {{ ref('rdg_ticket_type') }} t on t.ticket_code = k.ticket_code
join {{ ref('rdg_status_discount') }} d on d.status_code = w.status_code and d.discount_category = t.discount_category and d.indicator = '0' and d.percentage > 0
cross join {{ ref('rdg_feed') }} feed
where w.who = 'child' or k.kind <> 'seven-day'
