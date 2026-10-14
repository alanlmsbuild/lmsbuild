{#-
  RAW is add-only: each load adds its rows under a new SOURCEFILEID. Silver
  reads only the latest file of a data set (by SOURCE_FILE.LOADEDAT).
-#}
{% macro latest_file(source_name, raw_table) -%}
  (select SOURCEFILEID from {{ source('shared_raw', 'source_file') }}
   where SOURCE = '{{ source_name }}' and TARGETTABLE = 'SHARED_DB.RAW.{{ raw_table }}'
   qualify row_number() over (order by LOADEDAT desc, SOURCEFILEID) = 1)
{%- endmacro %}

{#- A GSS code as published, or null for blank and the ONS's "no area"
    codes (E99999999, S99999999, L99999999 and the rest). -#}
{% macro gss(column) -%}
  case when {{ column }} = '' or {{ column }} like '_99999999' then null else {{ column }} end
{%- endmacro %}
