{#-
  Which of the postcode directory's lookup files make SILVER.AREA_LOOKUP,
  and which headers hold the code, the name and the Welsh name. Files are
  matched by the start of their name and headers by pattern, so a new
  release ("as at 05_26", LAD26CD) still matches; the test
  onspd_lookup_files_found fails if one doesn't.
-#}
{% macro onspd_lookups() -%}
  {{ return([
    ('country',             'Documents/CTRY Country names and codes %',               'CTRY[0-9]*CD',    'CTRY[0-9]*NM',    'CTRY[0-9]*NMW'),
    ('region',              'Documents/RGN Region names and codes %',                 'RGN[0-9]*CD',     'RGN[0-9]*NM',     'RGN[0-9]*NMW'),
    ('local_authority',     'Documents/LAD Local Authority District names and codes %', 'LAD[0-9]*CD',   'LAD[0-9]*NM',     'LAD[0-9]*NMW'),
    ('county',              'Documents/CTY County names and codes %',                 'CTY[0-9]*CD',     'CTY[0-9]*NM',     none),
    ('electoral_division',  'Documents/CED County Electoral Division names and codes %', 'CED[0-9]*CD',  'CED[0-9]*NM',     none),
    ('ward',                'Documents/WD Ward names and codes %',                    'WD[0-9]*CD',      'WD[0-9]*NM',      'WD[0-9]*NMW'),
    ('parish',              'Documents/PARNCP Parish%',                               'PARNCP[0-9]*CD',  'PARNCP[0-9]*NM',  'PARNCP[0-9]*NMW'),
    ('constituency',        'Documents/PCON Westminster Parliamentary Constituency %', 'PCON[0-9]*CD',   'PCON[0-9]*NM',    'PCON[0-9]*NMW'),
    ('lsoa21',              'Documents/LSOA (2021) names and codes EW %',             'LSOA21CD',        'LSOA21NM',        none),
    ('lsoa21',              'Documents/LSOA (2021) DZ names and codes SC %',          'DZ[0-9]*CD',      'DZ[0-9]*NM',      none),
    ('lsoa21',              'Documents/LSOA (2021) SDZ names and codes NI %',         'SDZ[0-9]*CD',     'SDZ[0-9]*NM',     none),
    ('msoa21',              'Documents/MSOA (2021) names and codes EW %',             'MSOA21CD',        'MSOA21NM',        none),
    ('msoa21',              'Documents/MSOA (2021) IZ names and codes SC %',          'IZ[0-9]*CD',      'IZ[0-9]*NM',      none),
    ('built_up_area',       'Documents/BUA Built Up Area names and codes %',          'BUA[0-9]*CD',     'BUA[0-9]*NM',     'BUA[0-9]*NMW'),
    ('national_park',       'Documents/NPARK National Park names and codes %',        'NPARK[0-9]*CD',   'NPARK[0-9]*NM',   'NPARK[0-9]*NMW'),
    ('police_force',        'Documents/PFA Police Force Area names and codes %',      'PFA[0-9]*CD',     'PFA[0-9]*NM',     none),
    ('travel_to_work_area', 'Documents/TTWA Travel to Work Area names and codes %',   'TTWA[0-9]*CD',    'TTWA[0-9]*NM',    none),
    ('icb',                 'Documents/ICB Integrated Care Board names and codes %',  'ICB[0-9]*CD',     'ICB[0-9]*NM',     none),
    ('rural_urban_2021_ew', 'Documents/RUC21 Rural Urban (2021) Indicator names and codes EW %', 'RUC21IND', 'RUC21DESC', none),
    ('rural_urban_2021_sc', 'Documents/RUC21 Rural Urban (2021) Indicator names and codes SC %', 'RUC21IND', 'RUC21DESC', none),
  ]) }}
{%- endmacro %}

{#- The lookup files that came in the same zip as the latest ONSPD file. -#}
{% macro onspd_release_lookup_files() -%}
  (select f.SOURCEFILEID, f.MEMBER from {{ source('shared_raw', 'source_file') }} f
   where f.SOURCE = 'onspd-lookups'
     and f.ORIGINALSHA256 = (select ORIGINALSHA256 from {{ source('shared_raw', 'source_file') }} where SOURCEFILEID = {{ latest_file('onspd', 'ONSPD') }}))
{%- endmacro %}

{% macro onspd_lookup_values() -%}
  select * from values
  {%- for t in onspd_lookups() %}
    ('{{ t[0] }}', '{{ t[1] }}', '^{{ t[2] }}$', '^{{ t[3] }}$', {{ "'^" ~ t[4] ~ "$'" if t[4] else 'null' }}){{ ',' if not loop.last }}
  {%- endfor %}
{%- endmacro %}
