-- Cambridge is a district in Cambridgeshire and has no NEET figures of its own;
-- Barnsley is a unitary authority and is its own county.
select 'missing' as problem from (select 1) where
  (select count(*) from {{ ref('local_authority_county') }}
   where (local_authority_name, county_name, two_tier) in (('Cambridge', 'Cambridgeshire', true), ('Barnsley', 'Barnsley', false))) <> 2
