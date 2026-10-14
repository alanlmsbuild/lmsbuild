-- AREA_LOOKUP has exactly one row per different data row of the lookup files
-- it reads (a row repeated word for word in a file counts once).
with files as {{ onspd_release_lookup_files() }},
types (AREA_TYPE, MEMBER_LIKE, CODE_RE, NAME_RE, WELSH_RE) as ({{ onspd_lookup_values() }})
select silver, bronze from (
  select (select count(*) from {{ ref('area_lookup') }}) as silver,
         (select count(distinct AREA_TYPE, SOURCEFILEID, ROW_VALUES) from (
            select t.AREA_TYPE, c.SOURCEFILEID, listagg(c.VALUE, '|') within group (order by to_number(c.SHEETCOLUMN)) as ROW_VALUES
            from types t join files f on f.MEMBER like t.MEMBER_LIKE
            join {{ source('shared_raw', 'published_cell') }} c on c.SOURCEFILEID = f.SOURCEFILEID and c.SHEETROW <> c.HEADERROW
            group by t.AREA_TYPE, c.SOURCEFILEID, c.SHEETROW)) as bronze
) where silver <> bronze
