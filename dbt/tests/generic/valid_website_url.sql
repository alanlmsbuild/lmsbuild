{#- Every link in the column (when there is one) is a whole https:// web
    address (macros/url.sql). -#}
{% test valid_website_url(model, column_name) %}
select {{ column_name }} as url_
from {{ model }}
where {{ column_name }} is not null and not {{ valid_url(column_name) }}
{% endtest %}
