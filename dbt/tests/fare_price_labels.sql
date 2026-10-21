-- No fare shows a zero or empty price (Alan, 21 October 2026): a free pass
-- reads "Free" in price_text, never "£0.00", and no range starts at £0.00.
select 'bus_fare' as model, fare_key from {{ ref('bus_fare') }}
where price_min is null or price_max is null or price_text is null
   or (price_max = 0 and price_text <> 'Free') or price_text like '%£0.00%'
union all
select 'tram_fare', fare_key from {{ ref('tram_fare') }}
where price is null or price <= 0 or price_text is null or price_text like '£0.00%'
