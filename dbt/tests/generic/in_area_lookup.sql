{#- Every code in the column (when there is one) has a name in
    SILVER.AREA_LOOKUP for that kind of area. Returns the codes that don't. -#}
{% test in_area_lookup(model, column_name, area_type) %}
select {{ column_name }} as code, count(*) as rows_
from {{ model }}
where {{ column_name }} is not null
  and {{ column_name }} not in (select code from {{ ref('area_lookup') }} where area_type = '{{ area_type }}')
group by 1
{% endtest %}
