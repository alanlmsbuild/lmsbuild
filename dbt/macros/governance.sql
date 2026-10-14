{#-
  Decision 21: the governance tags (SHARED_DB.GOVERNANCE, made by
  sql/silver_01_setup.sql), set after every build by each model's post-hooks
  (dbt_project.yml), because a rebuilt table loses its tags.

  From the model's meta (layer and owner from dbt_project.yml; source,
  licence, attribution, refresh and sensitivity from its .yml): all seven on
  the table. Every column gets SENSITIVITY, its own or the table's; a column
  whose meta names its own source, licence or attribution (data from another
  data set joined in) gets those too, overriding what it inherits.
-#}

{% macro tag_value(value) -%}
  '{{ value | string | replace("'", "''") }}'
{%- endmacro %}

{% macro apply_table_tags() -%}
  {%- set m = model.config.meta -%}
  {%- set t = 'SHARED_DB.GOVERNANCE.' -%}
  alter table {{ this }} set tag
    {{ t }}LAYER = {{ tag_value(m.layer) }},
    {{ t }}OWNER = {{ tag_value(m.owner) }},
    {{ t }}SOURCE = {{ tag_value(m.source) }},
    {{ t }}LICENCE = {{ tag_value(m.licence) }},
    {{ t }}ATTRIBUTION = {{ tag_value(m.attribution) }},
    {{ t }}REFRESH = {{ tag_value(m.refresh) }},
    {{ t }}SENSITIVITY = {{ tag_value(m.sensitivity) }}
{%- endmacro %}

{% macro column_meta(column) -%}
  {%- set meta = {} -%}
  {%- do meta.update(column.get('meta') or {}) -%}
  {%- do meta.update((column.get('config') or {}).get('meta') or {}) -%}
  {{ return(meta) }}
{%- endmacro %}

{% macro apply_column_tags() -%}
  {%- set m = model.config.meta -%}
  {%- set t = 'SHARED_DB.GOVERNANCE.' -%}
  {%- set parts = [] -%}
  {%- for name, column in model.columns.items() -%}
    {%- set c = column_meta(column) -%}
    {%- set tags = [t ~ 'SENSITIVITY = ' ~ tag_value(c.get('sensitivity', m.sensitivity))] -%}
    {%- for key in ['source', 'licence', 'attribution'] -%}
      {%- if c.get(key) -%}{%- do tags.append(t ~ (key | upper) ~ ' = ' ~ tag_value(c[key])) -%}{%- endif -%}
    {%- endfor -%}
    {%- do parts.append('column ' ~ adapter.quote(name | upper) ~ ' set tag ' ~ (tags | join(', '))) -%}
  {%- endfor -%}
  alter table {{ this }} modify {{ parts | join(',\n    ') }}
{%- endmacro %}
