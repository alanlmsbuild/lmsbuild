{#-
  RAW is add-only: each load adds its rows under a new SOURCEFILEID. Silver
  reads only the latest file of a data set (by SOURCE_FILE.LOADEDAT).
  home: 'shared' (SHARED_DB.RAW) or 'options' (OPTIONS_DB.RAW).
-#}
{% macro latest_file(source_name, raw_table, home='shared') -%}
  (select SOURCEFILEID from {{ source(home ~ '_raw', 'source_file') }}
   where SOURCE = '{{ source_name }}' and TARGETTABLE = '{{ 'OPTIONS_DB' if home == 'options' else 'SHARED_DB' }}.RAW.{{ raw_table }}'
   qualify row_number() over (order by LOADEDAT desc, SOURCEFILEID) = 1)
{%- endmacro %}

{#- A GSS code as published, or null for blank and the ONS's "no area"
    codes (E99999999, S99999999, L99999999 and the rest). -#}
{% macro gss(column) -%}
  case when {{ column }} = '' or {{ column }} like '_99999999' then null else {{ column }} end
{%- endmacro %}

{#- A number as published, or null when it isn't one: blank, z (not
    applicable), c and low (withheld by the publisher), x (not available).
    Bronze keeps the reason; hiding small numbers is the app's job. -#}
{% macro num(column, scale=0) -%}
  try_to_number(replace({{ column }}, ',', ''), 38, {{ scale }})
{%- endmacro %}

{#- Text as published, or null for blank, z, NULL and the like. -#}
{% macro txt(column) -%}
  case when trim({{ column }}) in ('', 'z', 'NULL', 'NA', '-') then null else trim({{ column }}) end
{%- endmacro %}

{#- A date as published in the given format (e.g. DD-MM-YYYY), or null. -#}
{% macro dt(column, fmt) -%}
  try_to_date(nullif(trim({{ column }}), ''), '{{ fmt }}')
{%- endmacro %}
