-- One row per regulated qualification offered in England and open to new
-- learners ("Available to learners"), from the Ofqual register: the latest
-- record of each QAN (RAW is add-only). card_family says which kind of card
-- it is; on_cards is true for the seven families the options app explains
-- (GCSE, A level, AS level, T Level, Extended Project, Functional Skills,
-- BTEC), Levels 1 to 3. The other vocational qualifications stay here but
-- are not on the cards (docs/ideas.md).
--
-- The subject is read from the title (the register's sector subject area is
-- not a school subject): the text after "in" (or "for"), without a trailing
-- level, "(RQF)", "(delivered by ...)", specification letter or version.
-- qualification_subject_map (filled by hand) turns that text into the school
-- subject; without a row there the text itself is used.
-- Titles are read with white space collapsed (some hold line breaks or
-- non-breaking spaces).
with latest as (
  select r.QUALIFICATIONNUMBER as qan, r.ITEM as item, r.SOURCEFILEID as source_file_id
  from {{ source('shared_raw', 'ofqual_qualification') }} r
  join {{ source('shared_raw', 'source_file') }} f
    on f.SOURCEFILEID = r.SOURCEFILEID
   and f.SOURCE = 'ofqual-register' and f.TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_QUALIFICATION'
  qualify row_number() over (partition by r.QUALIFICATIONNUMBER order by f.LOADEDAT desc, r.SOURCEFILEID desc) = 1
),
q as (
  select
    qan,
    regexp_replace(trim(replace(item:title::varchar, chr(160), ' ')), '\\s+', ' ') as title,
    item:type::varchar as register_type,
    item:level::varchar as level,
    nullif(item:glh::number(8,0), 0) as glh,
    nullif(item:tqt::number(8,0), 0) as tqt,
    item:assessmentMethods as assessment_methods,
    item:organisationName::varchar as board_name,
    item:organisationAcronym::varchar as board_acronym,
    item:organisationRecognitionNumber::varchar as board_recognition_number,
    nullif(trim(item:linkToSpecification::varchar), '') as specification_url,
    try_to_date(left(item:operationalEndDate::varchar, 10)) as operational_end_date,
    try_to_date(left(item:lastUpdatedDate::varchar, 10)) as last_updated_date,
    source_file_id
  from latest
  where item:offeredInEngland::boolean and item:status::varchar = 'Available to learners'
),
fam as (
  select *,
    case
      when register_type in ('GCSE (9 to 1)', 'GCSE (A* to G)') and level in ('Level 1', 'Level 1/Level 2', 'Level 2', 'Level 3') then 'GCSE'
      when register_type = 'GCE A Level' and level = 'Level 3' then 'A level'
      when register_type = 'GCE AS Level' and level = 'Level 3' then 'AS level'
      when register_type = 'Technical Qualification' and level = 'Level 3' then 'T Level'
      when register_type = 'Project' and title ilike '%project%' and level in ('Level 1', 'Level 2', 'Level 3') then 'Extended Project'
      when register_type in ('Functional Skills', 'Digital Functional Skills Qualification') and level in ('Level 1', 'Level 2') then 'Functional Skills'
      when register_type in ('Vocationally-Related Qualification', 'Other Vocational Qualification', 'Occupational Qualification', 'Technical Occupation Qualification')
           and level in ('Level 1', 'Level 1/Level 2', 'Level 2', 'Level 3')
        then iff(title ilike '%BTEC%', 'BTEC', 'Other vocational')
      else 'Other'
    end as card_family
  from q
),
read as (
  select *,
    -- The text after "in" (BTECs also "for"); with no "in", a BTEC's text after its level, a GCSE's text after "GCSE (9-1)" and Functional Skills' "English" or "Mathematics" at the end.
    case
      when card_family = 'Extended Project' then 'Extended Project'
      when card_family = 'Functional Skills' and title ilike '%Digital Functional Skills%' then 'Digital'
      else coalesce(
        regexp_substr(title, iff(card_family = 'BTEC', ' (in|for) (.+)$', ' (in) (.+)$'), 1, 1, 'e', 2),
        case card_family
          when 'BTEC' then regexp_substr(title, 'BTEC\\s+(Level\\s*[0-9](\\s*/\\s*Level\\s*[0-9])?\\s+)?(.+)$', 1, 1, 'e', 3)
          when 'GCSE' then regexp_substr(title, 'GCSE \\(9-1\\) (.+)$', 1, 1, 'e')
          when 'Functional Skills' then regexp_substr(title, 'Functional Skills (English|Mathematics|Maths)$', 1, 1, 'ie')
        end)
    end as subject_text
  from fam
),
cleaned as (
  select *, nullif(upper(left(t, 1)) || substr(t, 2), '') as subject_raw
  from (
    select *, regexp_replace(trim(regexp_replace(regexp_replace(regexp_replace(subject_text,
      ' at (Entry )?Level.*$| \\((Level|RQF|Entry|delivered).*$', ''),
      ' \\(.*\\)$', ''),
      ' Specification [A-Z0-9]+$| [A-D]$| [0-9]+\\.[0-9]+$', '')), '^maths$', 'Mathematics', 1, 1, 'i') as t
    from read
  )
),
-- The specification: a trailing letter ("Biology B", "Specification A"), a
-- version ("English Language 2.0") or, with none, a short bracketed name
-- ("(Short Course)", "(Salters)"). A BTEC's is its level, since the same
-- award can be offered at two levels.
-- Bracketed levels, frameworks and long lists of options are not one.
variant as (
  select *, coalesce(
    regexp_substr(regexp_replace(subject_text, ' \\(.*\\)$', ''), ' (Specification )?([A-D])$', 1, 1, 'e', 2),
    regexp_substr(subject_text, ' ([0-9]+\\.[0-9]+)$', 1, 1, 'e'),
    iff(card_family = 'BTEC', level, null),
    case when card_family in ('GCSE', 'A level', 'AS level')
          and subject_text not rlike '.*\\((Level|RQF|QCF|NQF|Entry|delivered).*'
          and regexp_substr(subject_text, ' \\(([^()/]{1,30})\\)$', 1, 1, 'e') is not null
         then regexp_substr(subject_text, ' \\(([^()/]{1,30})\\)$', 1, 1, 'e') end) as specification_variant
  from cleaned
),
-- stem + suffix is the name without the specification.
named as (
  select v.*, coalesce(m.subject, v.subject_raw) as subject_final, m.subject is not null as mapped,
    -- A person-checked board name for the family, else for any family, else the register's acronym.
    coalesce(bf.display_name, ba.display_name, v.board_acronym) as board_display
  from variant v
  left join {{ ref('qualification_subject_map') }} m on lower(m.subject_raw) = lower(v.subject_raw)
  left join {{ ref('qualification_board_names') }} bf on lower(bf.board_acronym) = lower(v.board_acronym) and bf.card_family = v.card_family
  left join {{ ref('qualification_board_names') }} ba on lower(ba.board_acronym) = lower(v.board_acronym) and ba.card_family is null
),
stems as (
  select *,
    -- "GCSE English Literature (AQA)"; BTEC and T Level keep the size words
    -- ("BTEC National Extended Diploma in Horticulture (Pearson)"); Functional
    -- Skills and projects say their level, so two sizes never look the same.
    -- Framework tags such as (QCF) are left off.
    trim(regexp_replace(regexp_replace(case card_family
      when 'GCSE' then 'GCSE ' || subject_final
      when 'A level' then 'A level ' || subject_final
      when 'AS level' then 'AS level ' || subject_final
      when 'T Level' then 'T Level Technical Qualification in ' || subject_final
      when 'BTEC' then regexp_replace(title, '^.*?BTEC\\s+(Level\\s*[0-9](\\s*/\\s*Level\\s*[0-9])?\\s+)?', 'BTEC ')
      when 'Extended Project' then regexp_replace(title, '^.*?Level\\s*[0-9]\\s+', '')
      when 'Functional Skills' then iff(subject_raw = 'Digital', 'Digital Functional Skills ', 'Functional Skills ' || subject_final || ' ') || level
      else title
    end, ' \\((QCF|RQF|NQF|EQF|SCQF)\\)', ''), '\\s+', ' ')) as stem,
    iff(card_family in ('Other', 'Other vocational'), '', ' (' || board_display || ')') as suffix
  from named
)
select
  qan,
  title,
  card_family,
  card_family in ('GCSE', 'A level', 'AS level', 'T Level', 'Extended Project', 'Functional Skills', 'BTEC') as on_cards,
  -- The specification is added only where two cards would share a name.
  stem || iff(specification_variant is not null and count(*) over (partition by lower(stem || suffix)) > 1, ' ' || specification_variant, '') || suffix as card_name,
  specification_variant,
  register_type,
  level,
  glh,
  tqt,
  assessment_methods,
  board_name,
  board_acronym,
  board_recognition_number,
  specification_url,
  operational_end_date,
  last_updated_date,
  subject_raw,
  subject_final as subject,
  case when mapped then 'map' when subject_raw is not null then 'rule' end as subject_source,
  source_file_id
from stems
