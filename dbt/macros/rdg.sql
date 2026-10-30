{#- The lines of one file of the National Rail fares feed (RJFAF; layouts in
    RSPS5045, docs/licences/rsps5045/), from the latest feed loaded: ext is the
    file's extension (FFL flows and fares, LOC, FSC, TTY, DIS, RLC). One column,
    line, exactly as published.
    With --vars '{rdg_slice: true}' they come from SHARED_DB.SILVER_STAGING.
    RDG_FARES_SLICE instead: the feed cut down to the stations in the train_journey
    seed (scripts/fares/rdg_slice.py, scripts/fares/load_rdg_slice.js), for
    developing and testing on a small table. The daily build never sets it. -#}
{% macro rdg_lines(ext) -%}
  {%- if var('rdg_slice', false) -%}
  (select "line" as line from SHARED_DB.SILVER_STAGING.RDG_FARES_SLICE where "file_type" = '{{ ext }}')
  {%- else -%}
  (select "line" as line from {{ source('shared_raw', 'rdg_fares_line') }}
   where SOURCEFILEID = (select SOURCEFILEID from {{ source('shared_raw', 'source_file') }}
     where SOURCE = 'rdg-fares' and TARGETTABLE = 'SHARED_DB.RAW.RDG_FARES_LINE' and MEMBER like '%.{{ ext }}'
     qualify row_number() over (order by LOADEDAT desc, SOURCEFILEID) = 1))
  {%- endif -%}
{%- endmacro %}

{#- A date in a fares file (ddmmyyyy), or null. The high date 31122999 is kept
    as 2999-12-31: "no end date". -#}
{% macro rdg_date(start_position, column='line') -%}
  try_to_date(substr({{ column }}, {{ start_position }}, 8), 'DDMMYYYY')
{%- endmacro %}
