{#- The ONS Code History Database (SHARED_DB.RAW.ONS_CODE_CHANGE, load:data step 55).
    The latest file loaded, as a subquery of SOURCEFILEIDs. -#}
{% macro chd_files() -%}
  (select SOURCEFILEID from (
     select SOURCEFILEID,
       row_number() over (partition by TARGETTABLE order by LOADEDAT desc, SOURCEFILEID) as n
     from {{ source('shared_raw', 'source_file') }}
     where SOURCE = 'ons-code-history' and TARGETTABLE = 'SHARED_DB.RAW.ONS_CODE_CHANGE')
   where n = 1)
{%- endmacro %}
