{#-
  The honesty rules, built in once at gold (the gold plan, 14 October 2026).
  A port of the school leavers app's scripts/lib/rules.mjs (decided by Alan,
  8 October 2026), so gold and the site agree:
    - based on fewer than 10 people (honesty_hide_below): hidden,
      reason fewer-than-10
    - based on 10 to 29 (below honesty_care_below): shown, small_group
    - withheld by the publisher: hidden, saying why (c withheld, low
      too-few, x or anything not a number unavailable)
    - not applicable (blank, z, NULL, NA): not shown at all (status null)
  value and base are text exactly as published (silver *_published).
  text=true for a figure that is text, such as a grade (B-) or a banding.
-#}

{#- What a published reading is: null (doesn't apply), withheld, too-few,
    unavailable, or number. -#}
{% macro reading_kind(raw) -%}
  case
    when trim(coalesce({{ raw }}, '')) in ('', 'z', 'NULL', 'NA') then null
    when trim({{ raw }}) = 'c' then 'withheld'
    when trim({{ raw }}) = 'low' then 'too-few'
    when regexp_like(trim(replace({{ raw }}, ',', '')), '[-+]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][-+]?[0-9]+)?') then 'number'
    else 'unavailable'
  end
{%- endmacro %}

{#- The same for a text figure: c, low and x carry their reason; any other
    text is the figure itself. -#}
{% macro text_kind(raw) -%}
  case
    when trim(coalesce({{ raw }}, '')) in ('', 'z', 'NULL') then null
    when trim({{ raw }}) = 'c' then 'withheld'
    when trim({{ raw }}) = 'low' then 'too-few'
    when trim({{ raw }}) = 'x' then 'unavailable'
    else 'text'
  end
{%- endmacro %}

{% macro reading_number(raw) -%}
  case when {{ reading_kind(raw) }} = 'number' then to_double(trim(replace({{ raw }}, ',', ''))) end
{%- endmacro %}

{#- A figure's status: null (not shown at all), shown, or why it is hidden
    (fewer-than-10, withheld, too-few, unavailable). The order of the tests
    is rules.mjs's figure(). -#}
{% macro figure_status(value, base, text=false) -%}
  {%- set v = text_kind(value) if text else reading_kind(value) -%}
  {%- set b = reading_kind(base) -%}
  case
    when ({{ v }}) is null and ({{ b }}) is null then null
    when ({{ b }}) in ('withheld', 'too-few', 'unavailable') then ({{ b }})
    when ({{ b }}) is null then case when ({{ v }}) in ('withheld', 'too-few', 'unavailable') then ({{ v }}) end
    when {{ reading_number(base) }} < {{ var('honesty_hide_below') }} then 'fewer-than-10'
    when ({{ v }}) is null then null
    when ({{ v }}) in ('withheld', 'too-few', 'unavailable') then ({{ v }})
    else 'shown'
  end
{%- endmacro %}

{#- The columns of one figure, for a gold row:
      status, value_text, value_number, base, small_group, hidden_reason.
    The value and base only when it is shown. -#}
{% macro figure_columns(value, base, text=false) -%}
  {%- set status = figure_status(value, base, text) -%}
  ({{ status }})::varchar as status,
  case when ({{ status }}) = 'shown' then {{ ('trim(' ~ value ~ ')') if text else 'null' }} end::varchar as value_text,
  case when ({{ status }}) = 'shown' then {{ 'null' if text else reading_number(value) }} end::float as value_number,
  case when ({{ status }}) = 'shown' then {{ reading_number(base) }} end::number(38,0) as base,
  (({{ status }}) = 'shown' and {{ reading_number(base) }} < {{ var('honesty_care_below') }}) as small_group,
  case when ({{ status }}) not in ('shown') then ({{ status }}) end::varchar as hidden_reason
{%- endmacro %}
