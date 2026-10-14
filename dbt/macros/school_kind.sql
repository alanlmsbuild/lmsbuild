{#-
  What families call a school or college, from GIAS: the same rule as the
  school leavers app's import (school-leavers-app/scripts/import-institutions.mjs,
  kindOf), so silver and the site agree.
-#}
{% macro school_kind(g) -%}
  case
    when {{ g }}."TypeOfEstablishment (name)" = 'Further education' then
      case
        when {{ g }}."FurtherEducationType (name)" like 'Sixth Form College%' then 'sixth-form-college'
        when {{ g }}."FurtherEducationType (name)" = 'Land-Based College' then 'land-based-college'
        when regexp_like({{ g }}."FurtherEducationType (name)", '.*(Specialist|Art, Design).*') then 'specialist-college'
        else 'fe-college'
      end
    when {{ g }}."TypeOfEstablishment (name)" ilike '%independent%' then 'independent-school'
    when {{ g }}."TypeOfEstablishment (name)" = 'University technical college' then 'utc'
    when {{ g }}."TypeOfEstablishment (name)" = 'Studio schools' then 'studio-school'
    when {{ g }}."TypeOfEstablishment (name)" ilike '%special%' then 'special-school'
    when {{ g }}."TypeOfEstablishment (name)" = 'Sixth form centres' then 'sixth-form-centre'
    when {{ g }}."PhaseOfEducation (name)" = '16 plus' then '16-19-school'
    else 'school-sixth-form'
  end
{%- endmacro %}

{#- A postcode as typed, ready to match SHARED_DB.SILVER.POSTCODE.POSTCODE_COMPACT. -#}
{% macro compact_postcode(column) -%}
  nullif(upper(regexp_replace({{ column }}, '\\s', '')), '')
{%- endmacro %}
