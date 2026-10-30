{#- A model that is rebuilt only when the files it is built from have changed
    (as rdg_reusable does for the fares feed and oak_reusable for Oak). stamp_now
    is the SQL of the stamp worked out afresh (a scalar subquery); label is for
    the log. Otherwise this gives the live table (as the swap left it) and the
    model copies it, which costs next to nothing. Gives nothing (so the model
    builds) when the build is not the staging one, the live table doesn't exist
    yet, or its built_from isn't this stamp. -#}
{% macro file_gated(stamp_now, label) -%}
  {%- if not execute or target.name != 'staging' -%}
    {{ return(none) }}
  {%- endif -%}
  {%- set live_schema = this.schema | upper | replace('_STAGING', '') -%}
  {%- set live = this.database ~ '.' ~ live_schema ~ '.' ~ this.identifier -%}
  {%- set found = run_query("select count(*) from " ~ this.database ~ ".INFORMATION_SCHEMA.COLUMNS where TABLE_SCHEMA = '" ~ live_schema ~ "' and TABLE_NAME = '" ~ this.identifier | upper ~ "' and COLUMN_NAME = 'BUILT_FROM'") -%}
  {%- if found.columns[0].values()[0] == 0 -%}
    {{ return(none) }}
  {%- endif -%}
  {%- set same = run_query("select count(distinct built_from) = 1 and max(built_from) = " ~ stamp_now ~ " from " ~ live) -%}
  {%- if same.columns[0].values()[0] -%}
    {{ log(label ~ ': ' ~ this.identifier ~ ' unchanged, copied from ' ~ live, info=true) }}
    {{ return(live) }}
  {%- endif -%}
  {{ return(none) }}
{%- endmacro %}
