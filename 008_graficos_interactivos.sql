-- Corrige los ítems gráficos que se publicaban sin el diagrama.
begin;
alter table public.quiz_questions add column if not exists graph jsonb;
update public.quiz_questions set graph = '{"points":[[1,2],[2,3],[3,3.8],[4,5.1],[5,5.8],[6,7.1]],"defaultSlope":0.9,"defaultIntercept":1}'::jsonb where id='DIS01';
update public.quiz_questions set graph = '{"points":[[1,7],[2,6.2],[3,5.4],[4,4.1],[5,3.2],[6,2.4]],"defaultSlope":-0.9,"defaultIntercept":8}'::jsonb where id='COR01';
commit;
