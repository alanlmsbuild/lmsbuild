-- The apprenticeship provider and assessment register (APAR), one row per
-- UKPRN, from the latest download: the route it is registered on, its
-- status as published (blank when none is shown), and whether it can
-- deliver apprenticeships and apprenticeship units. Dates as published
-- (DD/MM/YYYY).
select
  r."Ukprn"::varchar as ukprn,
  r."Name"::varchar as provider_name,
  {{ txt('r."ApplicationType"') }}::varchar as register_route,
  {{ txt('r."Status"') }}::varchar as status,
  {{ dt('r."StartDate"', 'DD/MM/YYYY') }} as on_register_from,
  {{ dt('r."ApplicationDeterminedDate"', 'DD/MM/YYYY') }} as application_determined_on,
  (r."CanDeliverApprenticeships" = 'True')::boolean as can_deliver_apprenticeships,
  (r."CanDeliverApprenticeshipUnits" = 'True')::boolean as can_deliver_apprenticeship_units,
  r.SOURCEFILEID::varchar as source_file_id
from {{ source('shared_raw', 'apar_provider') }} r
where r.SOURCEFILEID = {{ latest_file('apar', 'APAR_PROVIDER') }}
