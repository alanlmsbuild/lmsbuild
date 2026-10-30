{#-
  Gold helpers (the gold plan, 14 October 2026).

  apply_reader_grants: each gold table is granted to the readers its model
  names in meta.readers (database roles; scripts/gold-readers.js has the
  same list and check:grants checks Snowflake keeps to it), and every other
  database role is revoked (30 October 2026: train fares kept Warren's and
  Meadow's old grants). Run as a
  post-hook: the grant is made where the table was built (GOLD_STAGING by
  the daily job) and the swap carries it into GOLD.
-#}
{% macro apply_reader_grants() -%}
  {%- if execute -%}
    {%- set wanted = model.config.meta.get('readers', []) -%}
    {%- for reader in wanted -%}
      {%- do run_query('grant select on table ' ~ this ~ ' to database role ' ~ reader) -%}
    {%- endfor -%}
    {#- The models keep the grants of the table they replace (copy_grants), so a
        reader taken out of meta.readers would keep its access for ever: revoke
        any database role that can read the table and is not named. -#}
    {%- set names = wanted | map('replace', this.database ~ '.', '') | list -%}
    {%- for row in run_query('show grants on table ' ~ this).rows -%}
      {%- set g = {} -%}
      {%- for k in row.keys() -%}{%- do g.update({k | lower: row[k]}) -%}{%- endfor -%}
      {%- if g['granted_to'] == 'DATABASE_ROLE' and g['privilege'] == 'SELECT' and g['grantee_name'] not in names -%}
        {%- do log('revoking ' ~ g['grantee_name'] ~ ' from ' ~ this, info=true) -%}
        {%- do run_query('revoke select on table ' ~ this ~ ' from database role ' ~ this.database ~ '.' ~ g['grantee_name']) -%}
      {%- endif -%}
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
