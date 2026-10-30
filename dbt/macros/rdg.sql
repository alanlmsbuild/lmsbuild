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

{#- What a parsed fares model was built from: the feed (its name and when it was
    loaded), the seed lists it reads (train_journey, train_ticket_kind), and a
    version of the parsing. Stored in each heavy model's built_from column.
    Change 'v1' when the parsing in rdg_flow or rdg_fare changes, so they are
    parsed again. -#}
{% macro rdg_stamp() -%}
  (select feed.feed || '|' || to_varchar(feed.loaded_at) || '|'
     || md5((select listagg(journey_key, ',') within group (order by journey_key) from {{ ref('train_journey') }})
            || (select listagg(ticket_code, ',') within group (order by ticket_code) from {{ ref('train_ticket_kind') }}))
     || '|v1'
   from {{ ref('rdg_feed') }} feed)
{%- endmacro %}

{#- The models that read the whole of the fares feed (rdg_flow and rdg_fare,
    8.5 million lines) are rebuilt only when what they are built from has
    changed. Otherwise this gives the live table (SILVER, as the swap left it)
    and the model copies it, which costs next to nothing. Gives nothing (so the
    model parses) when: the build is not the staging one, the slice is in use,
    the live table doesn't exist yet, or its built_from isn't this stamp. Done
    in the model, not by leaving it out of the build, so the swap and its
    previous-version staging tables work as they do for every other model. -#}
{% macro rdg_reusable() -%}
  {%- if not execute or target.name != 'staging' or var('rdg_slice', false) -%}
    {{ return(none) }}
  {%- endif -%}
  {%- set live_schema = this.schema | upper | replace('_STAGING', '') -%}
  {%- set live = this.database ~ '.' ~ live_schema ~ '.' ~ this.identifier -%}
  {%- set found = run_query("select count(*) from " ~ this.database ~ ".INFORMATION_SCHEMA.COLUMNS where TABLE_SCHEMA = '" ~ live_schema ~ "' and TABLE_NAME = '" ~ this.identifier | upper ~ "' and COLUMN_NAME = 'BUILT_FROM'") -%}
  {%- if found.columns[0].values()[0] == 0 -%}
    {{ return(none) }}
  {%- endif -%}
  {%- set same = run_query("select count(distinct built_from) = 1 and max(built_from) = " ~ rdg_stamp() ~ " from " ~ live) -%}
  {%- if same.columns[0].values()[0] -%}
    {{ log('rdg: ' ~ this.identifier ~ ' unchanged, copied from ' ~ live, info=true) }}
    {{ return(live) }}
  {%- endif -%}
  {{ return(none) }}
{%- endmacro %}
