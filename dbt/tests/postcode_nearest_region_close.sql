-- A postcode given the nearest electricity region (just outside NESO's
-- approximate boundaries) is within 5 km of it; further out would mean a
-- wrong grid reference or a missing region, not the coast.
select postcode, electricity_region, electricity_region_distance_m
from {{ ref('postcode') }}
where electricity_region_by_distance and electricity_region_distance_m > 5000
