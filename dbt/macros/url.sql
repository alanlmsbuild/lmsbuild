{#-
  Decision 26: an institution's own website, as a link we can show. The
  address as published, trimmed; its scheme taken off (http://, https://,
  or written without the slashes) and a trailing full stop dropped; then
  https:// put on the front. Kept only if it is a valid web address (a host
  with a dot, an optional port, then a path, query or fragment with no
  spaces); otherwise null. A site that only answers on http is left for the
  link check to find.
-#}
{% macro website_url(column) -%}
  {%- set cleaned = "'https://' || regexp_replace(regexp_replace(trim(" ~ column ~ "), '^[hH][tT][tT][pP][sS]?:/{0,2}', ''), '\\\\.$', '')" -%}
  case when trim(coalesce({{ column }}, '')) <> '' and {{ valid_url(cleaned) }} then {{ cleaned }} end
{%- endmacro %}

{#- A whole https:// web address (the rule website_url keeps to). -#}
{% macro valid_url(expression) -%}
  regexp_like({{ expression }}, 'https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?')
{%- endmacro %}
