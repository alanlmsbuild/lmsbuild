{#- A date in words, "5 October 2026" (Snowflake has no format for a day
    without its leading zero, and no FM prefix: 'DD FMMonth YYYY' gives
    "05 F10ont0 2026"). -#}
{% macro long_date(column) -%}
  (to_varchar(date_part(day, {{ column }})) || ' ' || to_varchar({{ column }}, 'MMMM') || ' ' || to_varchar(date_part(year, {{ column }})))
{%- endmacro %}
