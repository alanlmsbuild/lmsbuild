-- Typical train fares for the journeys in train_journey (decision 19, phase C),
-- from the National Rail fares feed (under the National Rail Enquiries
-- terms v3.0): one row per journey and kind of ticket. The adult fare in
-- pounds exactly as the feed publishes it; where a journey has more than one
-- route the price reads "£5.60 to £6.40 depending on route" with the routes
-- named in plain words (train_route_name, and for a route the feed does not name
-- the fare-setter from the flow's own operator, rdg_toc; the feed's own names kept in
-- routes_feed_text). Nothing is averaged, rounded or summed, and train fares are never
-- added to bus or tram fares or to journey times. A kind of ticket the feed
-- has never priced for the journey is not here (Off-Peak singles are not
-- sold on most of these journeys); one the feed has priced but whose fares
-- have all ended reads "No current fare: check National Rail". Only fares
-- in force on the day gold is built are shown (expired ones, and ones that
-- start later, are not). A fare's end date is shown only when nothing takes over
-- from it (a fare ending on 31 October with a new one from 1 November shows none).
-- Every row says which feed it is from and when it
-- was published.
with fares as (
  select f.journey_key, k.kind, k.label, k.sort_order, f.route_code, f.fare_pence, f.restriction_code, f.start_date, f.end_date,
         current_date() between f.start_date and f.end_date as is_current,
         coalesce(nullif(trim(r.description, ' .'), ''), 'route ' || f.route_code) as route_feed_label,
         coalesce(replace(n.display_name, '{fare_setter}', coalesce(t.toc_label, fl.toc)), nullif(trim(r.description, ' .'), ''), 'route ' || f.route_code) as route_label
  from {{ ref('rdg_fare') }} f
  join {{ ref('train_ticket_kind') }} k on k.ticket_code = f.ticket_code
  join {{ ref('rdg_flow') }} fl on fl.journey_key = f.journey_key and fl.flow_id = f.flow_id
  left join {{ ref('rdg_route') }} r on r.route_code = f.route_code
  left join {{ ref('train_route_name') }} n on n.route_code = f.route_code
  left join {{ ref('rdg_toc') }} t on t.fare_toc_id = fl.toc
),
priced as (
  select f.journey_key, f.kind, any_value(f.label) as label, any_value(f.sort_order) as sort_order,
         min(iff(f.is_current, f.fare_pence, null)) as pence_min,
         max(iff(f.is_current, f.fare_pence, null)) as pence_max,
         count(distinct iff(f.is_current, f.route_label, null)) as route_labels,
         listagg(distinct iff(f.is_current, f.route_label, null), '; ') within group (order by iff(f.is_current, f.route_label, null)) as route_names,
         listagg(distinct iff(f.is_current, f.route_feed_label, null), '; ') within group (order by iff(f.is_current, f.route_feed_label, null)) as route_feed_names,
         iff(count_if(f.start_date > current_date()) > 0, null, min(iff(f.is_current, f.end_date, null))) as valid_to,
         boolor_agg(iff(f.is_current, f.restriction_code is not null, false)) as restricted
  from fares f
  group by f.journey_key, f.kind
)
select
  (p.journey_key || '|' || p.kind)::varchar as fare_key,
  p.journey_key::varchar as journey_key,
  j.from_label::varchar as from_label,
  j.to_label::varchar as to_label,
  p.kind::varchar as kind,
  p.label::varchar as kind_label,
  p.sort_order::number(3,0) as sort_order,
  (p.pence_min / 100)::number(10,2) as price_min,
  (p.pence_max / 100)::number(10,2) as price_max,
  case when p.pence_min is null then 'No current fare: check National Rail'
       when p.pence_min = p.pence_max then '£' || to_varchar(p.pence_min / 100, 'FM990.00')
       else '£' || to_varchar(p.pence_min / 100, 'FM990.00') || ' to £' || to_varchar(p.pence_max / 100, 'FM990.00') || ' depending on route' end::varchar as price_text,
  iff(p.route_labels > 1 or p.route_names like '%fare)%', p.route_names, null)::varchar as routes_text,
  iff(p.route_labels > 1 or p.route_names like '%fare)%', p.route_feed_names, null)::varchar as routes_feed_text,
  coalesce(p.restricted, false)::boolean as restricted,
  iff(p.valid_to < '2999-12-31'::date, p.valid_to, null)::date as valid_to,
  ('Fares as published on ' || {{ long_date('feed.published_on') }} || ': check on National Rail.')::varchar as caveat,
  feed.feed::varchar as feed,
  feed.published_on::date as published_on,
  current_date()::date as built_on
from priced p
join {{ ref('train_journey') }} j on j.journey_key = p.journey_key
cross join {{ ref('rdg_feed') }} feed
