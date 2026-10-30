{#- Oak National Academy's curriculum (decision 56). Bronze is add-only, with
    one file per subject for units and lessons and one for the quizzes; silver
    reads the latest file of each (by SOURCE_FILE.LOADEDAT, per original name).
    This is that list of SOURCEFILEIDs, as a subquery. -#}
{% macro oak_files() -%}
  (select SOURCEFILEID from (
     select SOURCEFILEID,
       row_number() over (partition by TARGETTABLE, ORIGINALNAME order by LOADEDAT desc, SOURCEFILEID) as n
     from {{ source('options_raw', 'source_file') }}
     where SOURCE = 'oak-curriculum'
       and TARGETTABLE in ('OPTIONS_DB.RAW.OAK_UNIT', 'OPTIONS_DB.RAW.OAK_LESSON', 'OPTIONS_DB.RAW.OAK_QUIZ'))
   where n = 1)
{%- endmacro %}

{#- What an Oak model was built from: those files, and a version of the
    parsing. oak_feed works it out once (its built_from); the models take it
    from there (oak_stamp), and oak_reusable compares the live tables with it
    worked out afresh (oak_stamp_now). Change 'v2' in oak_feed and here when
    the parsing in a silver Oak model changes, so they are built again. -#}
{% macro oak_stamp() -%}
  (select built_from from {{ ref('oak_feed') }})
{%- endmacro %}

{% macro oak_stamp_now() -%}
  (select md5(listagg(f.SOURCEFILEID, ',') within group (order by f.SOURCEFILEID)) || '|v2' from {{ oak_files() }} f)
{%- endmacro %}

{#- The Oak models are rebuilt only when a newer Oak file has been loaded (as
    rdg_reusable does for the fares feed, macros/rdg.sql): otherwise this gives
    the live table (as the swap left it) and the model copies it. Gives nothing
    (so the model builds) when the build is not the staging one, the live table
    doesn't exist yet, or its built_from isn't this stamp. -#}
{% macro oak_reusable() -%}
  {%- if not execute or target.name != 'staging' -%}
    {{ return(none) }}
  {%- endif -%}
  {%- set live_schema = this.schema | upper | replace('_STAGING', '') -%}
  {%- set live = this.database ~ '.' ~ live_schema ~ '.' ~ this.identifier -%}
  {%- set found = run_query("select count(*) from " ~ this.database ~ ".INFORMATION_SCHEMA.COLUMNS where TABLE_SCHEMA = '" ~ live_schema ~ "' and TABLE_NAME = '" ~ this.identifier | upper ~ "' and COLUMN_NAME = 'BUILT_FROM'") -%}
  {%- if found.columns[0].values()[0] == 0 -%}
    {{ return(none) }}
  {%- endif -%}
  {%- set same = run_query("select count(distinct built_from) = 1 and max(built_from) = " ~ oak_stamp() ~ " from " ~ live) -%}
  {%- if same.columns[0].values()[0] -%}
    {{ log('oak: ' ~ this.identifier ~ ' unchanged, copied from ' ~ live, info=true) }}
    {{ return(live) }}
  {%- endif -%}
  {{ return(none) }}
{%- endmacro %}

{#- A subject's name in words, from its slug (the sequence name without
    -secondary). -#}
{% macro oak_subject_title(slug) -%}
  case {{ slug }}
    when 'rshe-pshe' then 'RSHE and PSHE'
    when 'cooking-nutrition' then 'Cooking and nutrition'
    when 'design-technology' then 'Design and technology'
    else upper(left(replace({{ slug }}, '-', ' '), 1)) || substr(replace({{ slug }}, '-', ' '), 2)
  end
{%- endmacro %}

{#- Oak's attribution line for a lesson (Oak's terms), in Oak's words:
    "A [subject] lesson by Oak National Academy licensed under Open Government
    Licence (OGL)", with the link to the licence beside it in oak_licence_url. -#}
{% macro oak_attribution(slug, title) -%}
  case when {{ slug }} in ('art', 'english', 'rshe-pshe') then 'An ' else 'A ' end
  || case when {{ slug }} in ('english', 'french', 'german', 'spanish', 'rshe-pshe') then {{ title }} else lower({{ title }}) end
  || ' lesson by Oak National Academy licensed under Open Government Licence (OGL)'
{%- endmacro %}

{% macro oak_licence_url() -%}
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'
{%- endmacro %}

{#- A lesson's page on Oak's website (a link for students to follow; the app
    never calls Oak). -#}
{% macro oak_lesson_url(slug) -%}
  'https://www.thenational.academy/teachers/lessons/' || {{ slug }}
{%- endmacro %}
