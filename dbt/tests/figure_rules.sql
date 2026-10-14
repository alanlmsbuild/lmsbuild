-- The honesty rules (macros/figure.sql) on the cases rules.mjs decides:
-- returns every case whose result differs from the app's.
with cases (case_, value, base, is_text, want_status, want_value, want_small) as (
  select * from values
    ('ordinary number',              '87.9',  '3700', false, 'shown',         '87.9',  false),
    ('base 29: small group',         '50',    '29',   false, 'shown',         '50',    true),
    ('base 30: not small',           '50',    '30',   false, 'shown',         '50',    false),
    ('base 10: shown, small',        '50',    '10',   false, 'shown',         '50',    true),
    ('base 9: hidden',               '50',    '9',    false, 'fewer-than-10', null,    false),
    ('base 0: hidden',               '0',     '0',    false, 'fewer-than-10', null,    false),
    ('value withheld (c)',           'c',     '40',   false, 'withheld',      null,    false),
    ('base withheld (c)',            '50',    'c',    false, 'withheld',      null,    false),
    ('value low',                    'low',   '40',   false, 'too-few',       null,    false),
    ('value x',                      'x',     '40',   false, 'unavailable',   null,    false),
    ('value not a number',           'n/a',   '40',   false, 'unavailable',   null,    false),
    ('value z: not applicable',      'z',     '40',   false, null,            null,    false),
    ('both z: not applicable',       'z',     'z',    false, null,            null,    false),
    ('no base, a value: not shown',  '50',    '',     false, null,            null,    false),
    ('no base, value withheld',      'c',     '',     false, 'withheld',      null,    false),
    ('base with a comma',            '50',    '1,234',false, 'shown',         '50',    false),
    ('grade text',                   'B-',    '96',   true,  'shown',         'B-',    false),
    ('grade text, small base',       'A+',    '12',   true,  'shown',         'A+',    true),
    ('grade text, base 5',           'A+',    '5',    true,  'fewer-than-10', null,    false),
    ('grade text withheld',          'c',     '96',   true,  'withheld',      null,    false),
    ('grade text z',                 'z',     '96',   true,  null,            null,    false)
),
results as (
  select case_, want_status, want_value, want_small, status as got_status, to_varchar(value_number) as got_value, small_group as got_small
  from (select case_, want_status, want_value, want_small, {{ figure_columns('value', 'base') }} from cases where not is_text)
  union all
  select case_, want_status, want_value, want_small, status, value_text, small_group
  from (select case_, want_status, want_value, want_small, {{ figure_columns('value', 'base', true) }} from cases where is_text)
)
select * from results
where not equal_null(got_status, want_status) or not equal_null(got_value, want_value) or coalesce(got_small, false) <> want_small
