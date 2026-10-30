// nomis-sets.js - the Nomis data sets (what scripts/fetch-official.js fetches)
// and the files fetched so far, which the load files (official.js,
// official2.js, official3.js) read to know what to load. Here, and not in
// fetch-official.js, because fetch-official.js imports load-data.js (and so
// those files) when it runs a load: a load file importing it back left the
// command line run waiting on itself forever ("unsettled top-level await",
// 30 October 2026).
import fs from 'node:fs'
import path from 'node:path'

const AREAS = 'geography=2092957699,2092957699TYPE442,2092957699TYPE423,2092957699TYPE424' // England, combined authorities, LAs (April 2023)

// APS: % with each RQF level (4+, 3, 2, 1, other, none), all and of the
// economically active, all, male and female, aged 16 to 64.
const APS_RQF = '1902,1903,1904,1911,1912,1913,1920,1921,1922,1929,1930,1931,1938,1939,1940,1947,1948,1949,1956,1957,1958,1965,1966,1967,1974,1975,1976,1983,1984,1985,1992,1993,1994,2001,2002,2003,2010,2011,2012,2037,2038,2039,2040,2041,2042,2043,2044,2045,2046,2047,2048,2049,2050,2051,2052,2053,2054'
// The 88 SIC 2007 divisions (2 digits), as Nomis codes them.
const SIC_DIVISIONS = '146800641,146800642,146800643,146800645,146800646,146800647,146800648,146800649,146800650,146800651,146800652,146800653,146800654,146800655,146800656,146800657,146800658,146800659,146800660,146800661,146800662,146800663,146800664,146800665,146800666,146800667,146800668,146800669,146800670,146800671,146800672,146800673,146800675,146800676,146800677,146800678,146800679,146800681,146800682,146800683,146800685,146800686,146800687,146800689,146800690,146800691,146800692,146800693,146800695,146800696,146800698,146800699,146800700,146800701,146800702,146800703,146800704,146800705,146800706,146800708,146800709,146800710,146800711,146800712,146800713,146800714,146800715,146800717,146800718,146800719,146800720,146800721,146800722,146800724,146800725,146800726,146800727,146800728,146800730,146800731,146800732,146800733,146800734,146800735,146800736,146800737,146800738,146800739'

export const NOMIS_SETS = [
  { id: 'NM_162_1', dir: 'claimant-count', base: 'claimant_count_nm_162_1', from: '',
    query: `${AREAS}&gender=0,1,2&age=0,2,10,11,3,4&measure=1,2&measures=20100`,
    select: 'date,date_name,geography_code,geography_name,geography_type,gender_name,age_name,measure_name,obs_value,obs_status_name' },
  ...[['NM_99_1', 'ashe_workplace_nm_99_1'], ['NM_30_1', 'ashe_resident_nm_30_1']].map(([id, base]) => ({ id, dir: 'ashe', base, from: '2015',
    query: `${AREAS}&sex=5,6,7,8,9&item=1,2,4,6,8,13,15&pay=1,5,6,7&measures=20100,20701`,
    select: 'date_name,geography_code,geography_name,geography_type,sex_name,item_name,pay_name,measures_name,obs_value,obs_status_name' })),
  // Annual Population Survey: qualifications (RQF) and employment,
  // unemployment and inactivity rates, aged 16 to 64, with confidence.
  { id: 'NM_17_5', dir: 'aps', base: 'aps_nm_17_5', from: '',
    query: `${AREAS}&variable=45,83,84,111,${APS_RQF}&measures=20599,21003`,
    select: 'date,date_name,geography_code,geography_name,geography_type,variable_code,variable_name,measures_name,obs_value,obs_status_name' },
  // UK Business Counts: local units and enterprises by SIC 2007 division and size band.
  ...[['NM_141_1', 'ubc_local_units_nm_141_1'], ['NM_142_1', 'ubc_enterprises_nm_142_1']].map(([id, base]) => ({ id, dir: 'business-counts', base, from: '',
    query: `${AREAS}&industry=${SIC_DIVISIONS}&employment_sizeband=0,10,20,30,40&legal_status=0&measures=20100`,
    select: 'date_name,geography_code,geography_name,geography_type,industry_name,employment_sizeband_name,legal_status_name,measures_name,obs_value,obs_status_name' })),
  // Business Register and Employment Survey (open access): employees and employment by SIC 2007 division.
  { id: 'NM_189_1', dir: 'bres', base: 'bres_nm_189_1', from: '',
    query: `${AREAS}&industry=${SIC_DIVISIONS}&employment_status=1,4&measure=1&measures=20100`,
    select: 'date_name,geography_code,geography_name,geography_type,industry_name,employment_status_name,measure_name,measures_name,obs_value,obs_status_name' },
  // Census 2021: occupation (TS063) and industry (TS060) of usual residents in employment.
  { id: 'NM_2080_1', dir: 'census-2021', base: 'census_ts063_occupation_nm_2080_1', from: '',
    query: `${AREAS}&measures=20100,20301`,
    select: 'date_name,geography_code,geography_name,geography_type,c2021_occ_10_name,measures_name,obs_value,obs_status_name' },
  // Population (ONS mid-year estimates), for rates per 1,000 people: by
  // LSOA (2021 areas) in broad age groups, all persons; by local authority
  // in five-year age bands, by sex.
  { id: 'NM_2014_1', dir: 'population', base: 'population_lsoa_nm_2014_1', from: '',
    query: 'geography=2092957699TYPE151&gender=0&c_age=200,201,202,203,250,204,205,207,208,209&measures=20100',
    select: 'date_name,geography_code,geography_name,geography_type,gender_name,c_age_name,measures_name,obs_value,obs_status_name' },
  { id: 'NM_31_1', dir: 'population', base: 'population_la_nm_31_1', from: '',
    query: `${AREAS}&sex=5,6,7&measures=20100`,
    select: 'date_name,geography_code,geography_name,geography_type,sex_name,age_name,measures_name,obs_value,obs_status_name' },
  // The same for Wales and its 22 authorities (its own file: AREAS is England).
  { id: 'NM_31_1', dir: 'population', base: 'population_la_wales_nm_31_1', from: '',
    query: 'geography=2092957700,2092957700TYPE424&sex=5,6,7&measures=20100',
    select: 'date_name,geography_code,geography_name,geography_type,sex_name,age_name,measures_name,obs_value,obs_status_name' },
  { id: 'NM_2077_1', dir: 'census-2021', base: 'census_ts060_industry_nm_2077_1', from: '',
    query: `${AREAS}&measures=20100,20301`,
    select: 'date_name,geography_code,geography_name,geography_type,c2021_ind_88_name,measures_name,obs_value,obs_status_name' },
]

// The files fetched for a Nomis set so far, with the last period each
// covers (from its .source.txt: "... to <period>>").
export function nomisFetched(dir, base) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => n.startsWith(base) && n.endsWith('.csv.source.txt')).map((n) => {
    const m = fs.readFileSync(path.join(dir, n), 'utf8').match(/ to ([^>]+)>/)
    return { file: path.join(dir, n.replace(/\.source\.txt$/, '')), to: m?.[1] ?? '' }
  })
}
