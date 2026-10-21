-- Fares whose "as at" date is over 12 months old stay in silver but are not
-- in gold (Alan, 21 October 2026): any such row in gold fails.
select fare_key, as_at from {{ ref('bus_fare') }}
where as_at < dateadd(month, -12, current_date())
