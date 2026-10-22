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
    -- The text after "in" (BTECs also "for"); with no "in", a GCSE's text after "GCSE (9-1)" and Functional Skills' "English" or "Mathematics" at the end.
    case
      when card_family = 'Extended Project' then 'Extended Project'
      when card_family = 'Functional Skills' and title ilike '%Digital Functional Skills%' then 'Digital'
      else coalesce(
        regexp_substr(title, iff(card_family = 'BTEC', ' (in|for) (.+)$', ' (in) (.+)$'), 1, 1, 'e', 2),
        case card_family
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
)
select
  c.qan,
  c.title,
  c.card_family,
  c.card_family in ('GCSE', 'A level', 'AS level', 'T Level', 'Extended Project', 'Functional Skills', 'BTEC') as on_cards,
  -- "GCSE English Literature (AQA)"; BTEC and T Level keep the size words
  -- ("BTEC National Extended Diploma in Horticulture (Pearson)"); Functional
  -- Skills and projects say their level, so two sizes never look the same.
  case c.card_family
    when 'GCSE' then 'GCSE ' || coalesce(m.subject, c.subject_raw)
    when 'A level' then 'A level ' || coalesce(m.subject, c.subject_raw)
    when 'AS level' then 'AS level ' || coalesce(m.subject, c.subject_raw)
    when 'T Level' then 'T Level Technical Qualification in ' || coalesce(m.subject, c.subject_raw)
    when 'BTEC' then regexp_replace(c.title, '^.*?BTEC\\s+(Level\\s*[0-9](\\s*/\\s*Level\\s*[0-9])?\\s+)?', 'BTEC ')
    when 'Extended Project' then regexp_replace(c.title, '^.*?Level\\s*[0-9]\\s+', '')
    when 'Functional Skills' then iff(c.subject_raw = 'Digital', 'Digital Functional Skills ', 'Functional Skills ' || coalesce(m.subject, c.subject_raw) || ' ') || c.level
    else c.title
  end || iff(c.card_family in ('Other', 'Other vocational'), '', ' (' || coalesce(b.display_name, c.board_acronym) || ')') as card_name,
  c.register_type,
  c.level,
  c.glh,
  c.tqt,
  c.assessment_methods,
  c.board_name,
  c.board_acronym,
  c.board_recognition_number,
  c.specification_url,
  c.operational_end_date,
  c.last_updated_date,
  c.subject_raw,
  coalesce(m.subject, c.subject_raw) as subject,
  case when m.subject is not null then 'map' when c.subject_raw is not null then 'rule' end as subject_source,
  c.source_file_id
from cleaned c
left join {{ ref('qualification_subject_map') }} m on lower(m.subject_raw) = lower(c.subject_raw)
left join {{ ref('qualification_board_names') }} b on lower(b.board_acronym) = lower(c.board_acronym)
