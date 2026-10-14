{#- SOC 2020 unit groups (4 digits) and their titles, from the ONS framework. -#}
{% macro soc_unit_groups() -%}
  (select "SOC2020 Unit Group" as code, "SOC2020 Group Title" as title
   from {{ source('shared_raw', 'soc2020_framework') }}
   where SOURCEFILEID = {{ latest_file('soc-coding-index', 'SOC2020_FRAMEWORK') }} and "SOC2020 Unit Group" <> '')
{%- endmacro %}

{#- SOC 2020 minor groups (3 digits) and their titles. -#}
{% macro soc_minor_groups() -%}
  (select "SOC2020 Minor Group" as code, "SOC2020 Group Title" as title
   from {{ source('shared_raw', 'soc2020_framework') }}
   where SOURCEFILEID = {{ latest_file('soc-coding-index', 'SOC2020_FRAMEWORK') }} and "SOC2020 Minor Group" <> '' and "SOC2020 Unit Group" = '')
{%- endmacro %}
