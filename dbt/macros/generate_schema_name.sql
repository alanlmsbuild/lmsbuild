{#- Models go in the schema they name (SILVER), not dbt's <target>_<schema>. -#}
{% macro generate_schema_name(custom_schema_name, node) -%}
  {{ (custom_schema_name or target.schema) | trim }}
{%- endmacro %}
