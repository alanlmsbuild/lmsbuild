-- provider_benchmark compares a row only when the provider's rate is shown,
-- based on 30 or more leavers, and DfE publishes the national rate for the
-- same type and breakdown; the words follow the difference (5 points,
-- Rarebit's rule); and a row that is not compared always says why.
select benchmark_key, status, base, national_status, difference_points, compared_with_national, comparison_note
from {{ ref('provider_benchmark') }}
where (compared_with_national is not null and not (status = 'shown' and base >= {{ var('honesty_care_below') }} and national_status = 'shown'))
   or (compared_with_national is not null and comparison_note is not null)
   or (compared_with_national is null and comparison_note is null)
   or (compared_with_national is null) <> (difference_points is null)
   or (compared_with_national = 'above' and difference_points <= 5)
   or (compared_with_national = 'below' and difference_points >= -5)
   or (compared_with_national = 'about the same' and abs(difference_points) > 5)
