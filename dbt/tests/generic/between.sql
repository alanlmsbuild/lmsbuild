{#- Every value in the column (when there is one) is between min and max. -#}
{% test between(model, column_name, min, max) %}
select {{ column_name }} as value_
from {{ model }}
where {{ column_name }} is not null and ({{ column_name }} < {{ min }} or {{ column_name }} > {{ max }})
{% endtest %}
