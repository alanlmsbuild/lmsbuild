-- Zoom Beyond is for 18 to 21 and shows as "18 to 21" (Travel South
-- Yorkshire, confirmed by Alan 21 October 2026); every WHO has its label.
select fare_key from {{ ref('bus_fare') }}
where who_label is null
   or (pass_name = 'Zoom Beyond' and who_label <> '18 to 21')
   or (who = '18-21' and who_label <> '18 to 21')
