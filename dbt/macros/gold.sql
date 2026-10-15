{#-
  Gold helpers (the gold plan, 14 October 2026).

  apply_reader_grants: each gold table is granted to the readers its model
  names in meta.readers (database roles; scripts/gold-readers.js has the
  same list and check:grants checks Snowflake keeps to it). Run as a
  post-hook: the grant is made where the table was built (GOLD_STAGING by
  the daily job) and the swap carries it into GOLD.
-#}
{% macro apply_reader_grants() -%}
  {%- if execute -%}
    {%- for reader in model.config.meta.get('readers', []) -%}
      {%- do run_query('grant select on table ' ~ this ~ ' to database role ' ~ reader) -%}
    {%- endfor -%}
  {%- endif -%}
  select 1
{%- endmacro %}

{#- When the source file a figure came from was downloaded (DOWNLOADED_ON; not when it was published):
    join SOURCE_FILE as alias on the figure's source_file_id, then select
    to_date(alias.ORIGINALMODIFIEDAT). (A correlated subquery isn't
    supported here.) -#}
{% macro source_file_join(alias, source_file_id, home='options') -%}
  left join {{ source(home ~ '_raw', 'source_file') }} {{ alias }} on {{ alias }}.SOURCEFILEID = {{ source_file_id }}
{%- endmacro %}

{#- The institutions the school leavers app shows: every one in the 16 to 18
    results that GIAS says is open and that has at least one result in a
    cohort the app shows (its import-institutions.mjs rule). -#}
{% macro school_leavers_kept() -%}
  select distinct r.urn
  from {{ ref('performance_16_18_result') }} r
  join {{ ref('college_16_18') }} c on c.urn = r.urn and c.is_open
  where r.cohort in {{ school_cohorts() }}
    and coalesce({{ figure_status('r.grade_published', 'r.grade_base_published', true) }},
                 {{ figure_status('r.retained_percent_published', 'r.retained_base_published') }},
                 {{ figure_status('r.progress_published', 'r.grade_base_published', true) }}) is not null
{%- endmacro %}
