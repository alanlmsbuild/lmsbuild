{#- Travel times (decision 19). Phase A's area: South Yorkshire's four
    authorities (Barnsley and Sheffield took new codes in April 2023). -#}
{% macro travel_area_las() -%}
  ('E08000038', 'E08000017', 'E08000018', 'E08000039')
{%- endmacro %}

{#- The children of an XML element as an array: Snowflake gives one child as
    the element itself and several as an array, so wrap the one. -#}
{% macro xml_children(element) -%}
  iff(is_array({{ element }}:"$"), {{ element }}:"$", array_construct({{ element }}:"$"))
{%- endmacro %}
