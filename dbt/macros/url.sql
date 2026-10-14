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

{#- A whole web address: https://, or http:// for a site the link check
    found answers only on http. -#}
{% macro valid_url(expression) -%}
  regexp_like({{ expression }}, 'https?://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?')
{%- endmacro %}

{#-
  The link check's verdict on a website (SHARED_DB.EXT.WEBSITE_LINK, kept by
  scripts/check-website-links.js; join it with website_link_join). raw: the
  address as the source gives it.
    website_url_listed  the cleaned link, as checked (WEBSITE_LINK's key)
    website_url         the link to show: the listed one, or for a site
                        that only answers on http, where that ends up
    website_link_status ok, http-only, broken, unreachable, blocked or
                        unchecked (empty when there is no link)
    website_link_hidden true after two failed weekly checks in a row: the
                        app hides the link until a check passes
-#}
{% macro website_link_columns(raw) -%}
  {%- set listed = website_url(raw) -%}
  ({{ listed }})::varchar as website_url_listed,
  case when wl.LASTRESULT = 'http-only' then coalesce(wl.FINALURL, regexp_replace({{ listed }}, '^https:', 'http:')) else {{ listed }} end::varchar as website_url,
  case when {{ listed }} is not null then coalesce(wl.LASTRESULT, 'unchecked') end::varchar as website_link_status,
  coalesce(wl.ISHIDDEN, false) as website_link_hidden
{%- endmacro %}

{% macro website_link_join(raw) -%}
  left join {{ source('shared_ext', 'website_link') }} wl on wl.URL = {{ website_url(raw) }}
{%- endmacro %}
