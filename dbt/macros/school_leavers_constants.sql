{#-
  The school leavers app's own constants, as in its code (so gold and the
  site agree; the comparison script checks they do):
    school-leavers-app/scripts/lib/kinds.mjs  KINDS and COHORTS
    school-leavers-app/scripts/import-institutions.mjs  PROVIDER_TYPES
-#}

{#- kind, label, the DfE type its grades are compared with, the type its
    retention is compared with (none for independent schools), the group
    named on the page. -#}
{% macro school_kinds() -%}
  select * from values
    ('school-sixth-form', 'School with a sixth form', 'All state-funded schools', 'All state-funded mainstream schools', 'state-funded schools'),
    ('16-19-school', '16 to 19 school or academy', 'All state-funded schools', 'All state-funded mainstream schools', 'state-funded schools'),
    ('sixth-form-centre', 'Sixth form centre', 'All state-funded schools', 'All state-funded mainstream schools', 'state-funded schools'),
    ('utc', 'University technical college (UTC)', 'University Technical Colleges (UTCs)', 'University Technical Colleges (UTCs)', 'university technical colleges'),
    ('studio-school', 'Studio school', 'Studio schools', 'Studio schools', 'studio schools'),
    ('special-school', 'Special school', 'All state-funded schools', 'All state-funded mainstream schools', 'state-funded schools'),
    ('sixth-form-college', 'Sixth-form college', 'Sixth form colleges', 'Sixth form colleges', 'sixth-form colleges'),
    ('fe-college', 'Further education (FE) college', 'Other FE sector colleges', 'Other FE sector colleges', 'other FE colleges'),
    ('land-based-college', 'Land-based college', 'Other FE sector colleges', 'Other FE sector colleges', 'other FE colleges'),
    ('specialist-college', 'Specialist college', 'Other FE sector colleges', 'Other FE sector colleges', 'other FE colleges'),
    ('independent-school', 'Independent (fee-paying) school', 'All independent schools', null, 'independent schools')
    as k (kind, label, grades_type, retention_type, group_name)
{%- endmacro %}

{#- The 16 to 18 cohorts the app shows. -#}
{% macro school_cohorts() -%}('A level', 'Applied general', 'Tech level'){%- endmacro %}

{#- Provider types in plain words. -#}
{% macro provider_type_words() -%}
  select * from values
    ('General FE College incl Tertiary', 'general FE colleges'),
    ('Sixth Form College', 'sixth-form colleges'),
    ('Schools', 'schools'),
    ('Private Sector Public Funded', 'independent training providers'),
    ('Special College', 'specialist colleges'),
    ('Other Public Funded i.e LA''s and HE', 'councils and universities'),
    ('Local Authority', 'councils'),
    ('Other', 'other providers')
    as p (provider_type, words)
{%- endmacro %}
