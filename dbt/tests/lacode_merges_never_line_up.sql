-- A merge or a split never lines up: figures of the parts are not added up or
-- shared out, so such an old code has no current code.
select c.old_code from {{ ref('local_authority_code_current') }} c
join {{ ref('local_authority_code_change') }} h on h.old_code = c.old_code
where h.relationship in ('merged', 'split') and not exists (
  select 1 from {{ ref('local_authority_code_change') }} x where x.old_code = c.old_code and x.line_up)
