{#- Models go in the schema they name (SILVER), not dbt's <target>_<schema>;
    with the staging target (the transform job), in <schema>_STAGING. -#}
{% macro generate_schema_name(custom_schema_name, node) -%}
  {%- set name = (custom_schema_name or target.schema) | trim -%}
  {{ name ~ '_STAGING' if target.name == 'staging' else name }}
{%- endmacro %}
