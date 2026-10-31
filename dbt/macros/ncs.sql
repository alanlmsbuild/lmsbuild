{#- The National Careers Service course directory (load:data step 54). Bronze is
    add-only; silver reads the latest file of each table. With --vars
    '{ncs_scratch: true}' they come from OPTIONS_DB.SILVER_STAGING.SCRATCH_NCS_COURSE
    and SCRATCH_NCS_PROVIDER instead (a sample loaded by hand, for developing and
    testing before the bronze tables exist); the daily build never sets it. -#}
{% macro ncs_raw(table) -%}
  {%- if var('ncs_scratch', false) -%}
  OPTIONS_DB.SILVER_STAGING.SCRATCH_{{ table | upper }}
  {%- else -%}
  {{ source('options_raw', table) }}
  {%- endif -%}
{%- endmacro %}

{#- The latest file of the course and the provider tables, as a subquery of SOURCEFILEIDs. -#}
{% macro ncs_files() -%}
  {%- if var('ncs_scratch', false) -%}
  (select 'scratch' as SOURCEFILEID)
  {%- else -%}
  (select SOURCEFILEID from (
     select SOURCEFILEID,
       row_number() over (partition by TARGETTABLE order by LOADEDAT desc, SOURCEFILEID) as n
     from {{ source('options_raw', 'source_file') }}
     where SOURCE = 'ncs-course-directory' and TARGETTABLE in ('OPTIONS_DB.RAW.NCS_COURSE', 'OPTIONS_DB.RAW.NCS_PROVIDER'))
   where n = 1)
  {%- endif -%}
{%- endmacro %}

{#- The latest file of each LARS table the course card reads. -#}
{% macro ncs_lars_files() -%}
  (select SOURCEFILEID from (
     select SOURCEFILEID,
       row_number() over (partition by TARGETTABLE order by LOADEDAT desc, SOURCEFILEID) as n
     from {{ source('shared_raw', 'source_file') }}
     where SOURCE = 'lars' and TARGETTABLE in ('SHARED_DB.RAW.LARS_LEARNINGDELIVERY', 'SHARED_DB.RAW.LARS_NOTIONALNVQLEVELV2', 'SHARED_DB.RAW.LARS_SECTORSUBJECTAREATIER2', 'SHARED_DB.RAW.LARS_AWARDORGCODE'))
   where n = 1)
{%- endmacro %}

{#- What an NCS model was built from: the latest course and provider files, the
    LARS files joined, and a version of the parsing. ncs_feed works it out once
    (its built_from) and the models take it from there; ncs_reusable compares the
    live tables with it worked out afresh. Change 'v1' in ncs_feed and here when
    the parsing in a silver NCS model changes, so they are built again. -#}
{% macro ncs_stamp() -%}
  (select built_from from {{ ref('ncs_feed') }})
{%- endmacro %}

{% macro ncs_stamp_now() -%}
  (select md5(listagg(f.SOURCEFILEID, ',') within group (order by f.SOURCEFILEID)) || '|v1'
   from (select SOURCEFILEID from {{ ncs_files() }} union all select SOURCEFILEID from {{ ncs_lars_files() }}) f)
{%- endmacro %}

{% macro ncs_reusable() -%}
  {%- if var('ncs_scratch', false) -%}
    {{ return(none) }}
  {%- endif -%}
  {{ return(file_gated(ncs_stamp_now(), 'ncs')) }}
{%- endmacro %}

{#- NEET and participation by local authority (SHARED_DB.RAW.NEET_16_17_BY_CHARACTERISTICS,
    load:data step 23). The latest file of that table. -#}
{% macro neet_files() -%}
  (select SOURCEFILEID from (
     select SOURCEFILEID,
       row_number() over (partition by TARGETTABLE order by LOADEDAT desc, SOURCEFILEID) as n
     from {{ source('shared_raw', 'source_file') }}
     where SOURCE = 'neet-16-17' and TARGETTABLE = 'SHARED_DB.RAW.NEET_16_17_BY_CHARACTERISTICS')
   where n = 1)
{%- endmacro %}

{% macro neet_stamp() -%}
  (select built_from from {{ ref('neet_feed') }})
{%- endmacro %}

{% macro neet_stamp_now() -%}
  (select md5(listagg(f.SOURCEFILEID, ',') within group (order by f.SOURCEFILEID)) || '|v1' from {{ neet_files() }} f)
{%- endmacro %}

{% macro neet_reusable() -%}
  {{ return(file_gated(neet_stamp_now(), 'neet')) }}
{%- endmacro %}

{#- Course directory codes, as the publication's code tables give them. A code the
    tables do not define (course types 7, 8 and 9 appear in the file) gets no label. -#}
{% macro ncs_delivery_mode(c) -%}
  case {{ c }} when '1' then 'Classroom based' when '2' then 'Online' when '3' then 'Work based' when '4' then 'Blended learning' end
{%- endmacro %}
{% macro ncs_study_mode(c) -%}
  case {{ c }} when '1' then 'Full-time' when '2' then 'Part-time' when '3' then 'Flexible' end
{%- endmacro %}
{% macro ncs_attendance_pattern(c) -%}
  case {{ c }} when '1' then 'Daytime' when '2' then 'Evening' when '3' then 'Weekend' when '4' then 'Day or block release' end
{%- endmacro %}
{% macro ncs_duration_unit(c) -%}
  case {{ c }} when '1' then 'days' when '2' then 'weeks' when '3' then 'months' when '4' then 'years' when '5' then 'hours' when '6' then 'minutes' end
{%- endmacro %}
{% macro ncs_course_type(c) -%}
  case {{ c }} when '1' then 'Essential skills' when '2' then 'T Level' when '3' then 'Higher Technical Qualification' when '4' then 'Free Courses for Jobs'
    when '5' then 'Multiply' when '6' then 'Skills Bootcamp'
    when '7' then '[Unlabelled type 7]' when '8' then '[Unlabelled type 8]' when '9' then '[Unlabelled type 9]' end
{%- endmacro %}
