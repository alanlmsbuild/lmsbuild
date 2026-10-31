-- A current code is today's: it is a live local authority, and it is not itself
-- replaced by a change that lines up.
select old_code from {{ ref('local_authority_code_current') }}
where current_code not in (select local_authority_code from {{ ref('local_authority') }})
   or current_code in (select old_code from {{ ref('local_authority_code_current') }})
