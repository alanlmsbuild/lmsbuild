-- The course providers in the National Careers Service course directory, one
-- row per UKPRN: name, trading name, town, postcode and website as published.
-- Contact addresses, telephone numbers and email addresses were left out
-- before loading. A UKPRN listed more than once (6 of 2,318 rows) keeps its
-- fullest row (postcode, then website, then the first). Built only when a newer directory file has been loaded
-- (ncs_reusable, dbt/macros/ncs.sql).
{% set reuse = ncs_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
select
  trim(PROVIDER_UKPRN)::varchar as ukprn,
  {{ txt('PROVIDER_NAME') }}::varchar as provider_name,
  {{ txt('TRADING_NAME') }}::varchar as trading_name,
  {{ txt('CONTACT_TOWN') }}::varchar as town,
  {{ txt('CONTACT_POSTCODE') }}::varchar as postcode,
  {{ txt('CONTACT_WEBSITE') }}::varchar as website,
  {{ ncs_stamp() }}::varchar as built_from
from {{ ncs_raw('ncs_provider') }}
where SOURCEFILEID in {{ ncs_files() }}
qualify row_number() over (partition by trim(PROVIDER_UKPRN)
  order by (nullif(trim(CONTACT_POSTCODE), '') is not null) desc, (nullif(trim(CONTACT_WEBSITE), '') is not null) desc, FILEROWNUMBER) = 1
{% endif %}
