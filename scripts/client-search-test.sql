\pset pager off
\timing on
select public.act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;

\echo '=== A. "nguyen" (no diacritics) must find "Nguyễn" ==='
select first_name, last_name, phone_last4, last_visit, usual_tech
from public.staff_search_clients('nguyen', 5);

\echo '=== B. and the reverse: typing the diacritics finds them too ==='
select count(*) as rows_for_Nguyen from public.staff_search_clients('Nguyễn', 10);

\echo '=== C. "4142" — last four only ==='
select first_name, last_name, phone_last4, usual_tech
from public.staff_search_clients('4142', 5);

\echo '=== D. Two Maria Gonzalez, told apart by the row detail ==='
select first_name, last_name, phone_last4, last_visit, usual_tech
from public.staff_search_clients('maria gonzalez', 5);

\echo '=== E. A pure-digit query does not match names ==='
select count(*) as digit_query_rows from public.staff_search_clients('5559994142', 10);

\echo '=== F. Empty query returns nothing rather than everything ==='
select count(*) as empty_query_rows from public.staff_search_clients('', 10);
