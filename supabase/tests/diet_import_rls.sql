begin;

create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, email) values
 ('41000000-0000-0000-0000-000000000001','diet-nutritionist@example.test'),
 ('41000000-0000-0000-0000-000000000002','diet-patient@example.test'),
 ('41000000-0000-0000-0000-000000000003','diet-self@example.test'),
 ('41000000-0000-0000-0000-000000000004','diet-foreign@example.test'),
 ('41000000-0000-0000-0000-000000000005','diet-sudo@example.test');
insert into public.profiles (id,email,full_name,role,is_sudo,is_active) values
 ('41000000-0000-0000-0000-000000000001','diet-nutritionist@example.test','Nutritionist','patient',false,true),
 ('41000000-0000-0000-0000-000000000002','diet-patient@example.test','Patient','patient',false,true),
 ('41000000-0000-0000-0000-000000000003','diet-self@example.test','Self','patient',false,true),
 ('41000000-0000-0000-0000-000000000004','diet-foreign@example.test','Foreign','patient',false,true),
 ('41000000-0000-0000-0000-000000000005','diet-sudo@example.test','Sudo','patient',true,true);
insert into public.groups (id,name,slug) values
 ('42000000-0000-0000-0000-000000000001','Diet A','diet-a'),('42000000-0000-0000-0000-000000000002','Diet B','diet-b');
insert into public.group_memberships (id,group_id,user_id,status,activated_at) values
 ('43000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','active',now()),
 ('43000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002','active',now()),
 ('43000000-0000-0000-0000-000000000003','42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000003','active',now()),
 ('43000000-0000-0000-0000-000000000004','42000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000004','active',now());
insert into public.user_roles (membership_id,role_code) values
 ('43000000-0000-0000-0000-000000000001','nutritionist'),('43000000-0000-0000-0000-000000000002','patient'),
 ('43000000-0000-0000-0000-000000000003','self_manager'),('43000000-0000-0000-0000-000000000004','patient');

create temporary table diet_tokens(label text primary key, token uuid, plan_hash text);
create temporary table diet_baseline AS select * from public.daily_plan with no data;
create temporary table diet_dates(start_date date primary key);
insert into diet_dates values (public.diet_import_current_date() + ((3 - extract(isodow from public.diet_import_current_date())::integer + 7) % 7));
create temporary table weekly_plan(doc jsonb);
insert into weekly_plan values ((select jsonb_object_agg(day_name, meals) from (select day_name, jsonb_agg(jsonb_build_object('meal_type',meal_type,'title',day_name||'-'||meal_type,'ingredients','','recipe_url','https://example.test/r') order by ord) meals from unnest(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) day_name cross join unnest(array['DESAYUNO','MEDIA MAÑANA','ALMUERZO','MERIENDA','CENA','POSTRE NOCTURNO']) with ordinality m(meal_type,ord) group by day_name) s));
create temporary table diet_history(id integer primary key, payload text);
insert into diet_history values (1,'sentinel');
create temporary table diet_history_before as select * from diet_history;
grant all on table diet_tokens, diet_baseline, diet_dates, weekly_plan, diet_history, diet_history_before to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date()-1,%L::jsonb)','41000000-0000-0000-0000-000000000002',(select doc from weekly_plan)),'22023','La fecha inicial no puede estar en el pasado','past start date is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000004',(select doc from weekly_plan)),'42501','Operación no autorizada','foreign patient is rejected');
select lives_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',(select doc from weekly_plan)),'nutritionist imports for own patient');

select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select lives_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000003',(select doc from weekly_plan)),'self_manager imports own plan');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',(select doc from weekly_plan)),'42501','Operación no autorizada','self_manager cannot import another diet');
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',(select doc from weekly_plan)),'42501','Operación no autorizada','ordinary patient cannot import own diet');
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',(select doc from weekly_plan)),'42501','Operación no autorizada','sudo without functional role is rejected');

set local role postgres;
insert into public.daily_plan(user_id,date,meal_type,title,ingredients,is_completed) values
 ('41000000-0000-0000-0000-000000000002',public.diet_import_current_date()-1,'DESAYUNO','Before','keep',true),
 ('41000000-0000-0000-0000-000000000002',(public.diet_import_current_date()+interval '4 months')::date,'DESAYUNO','Far future','delete',true);
insert into diet_baseline select * from public.daily_plan where user_id='41000000-0000-0000-0000-000000000002' and date=public.diet_import_current_date()-1;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into diet_tokens select 'valid',token,plan_hash from public.prepare_diet_import('41000000-0000-0000-0000-000000000002',(select start_date from diet_dates),(select doc from weekly_plan));
select throws_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,true)',(select token from diet_tokens where label='valid'),repeat('d',64),'{}'),'22023','La confirmación no corresponde al plan revisado','token hash mismatch is rejected');
select ok(position('Europe/Madrid' in pg_get_functiondef('public.diet_import_current_date()'::regprocedure)) > 0,'Madrid date is used by prepare');
select ok(position('lock table public.daily_plan in share row exclusive mode' in lower(pg_get_functiondef('public.apply_diet_import(uuid,text,jsonb,boolean)'::regprocedure))) > 0,'import locks daily plan against concurrent writers');
insert into diet_tokens select 'changed-count',token,plan_hash from public.prepare_diet_import('41000000-0000-0000-0000-000000000002',(select start_date from diet_dates),(select doc from weekly_plan));
set local role postgres;
insert into public.daily_plan(user_id,date,meal_type,title,ingredients,is_completed) values ('41000000-0000-0000-0000-000000000002',(select start_date from diet_dates),'MEDIA MAÑANA','Concurrent','change',false);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,true)',(select token from diet_tokens where label='changed-count'),(select plan_hash from diet_tokens where label='changed-count'),(select doc from weekly_plan)),'22023','El plan futuro ha cambiado; prepare de nuevo','changed delete count requires a new confirmation');
set local role postgres;
delete from public.daily_plan where user_id='41000000-0000-0000-0000-000000000002' and title='Concurrent';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into diet_tokens select 'actor',token,plan_hash from public.prepare_diet_import('41000000-0000-0000-0000-000000000002',(select start_date from diet_dates),(select doc from weekly_plan));
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select throws_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,true)',(select token from diet_tokens where label='actor'),(select plan_hash from diet_tokens where label='actor'),(select doc from weekly_plan)),'42501','Operación no autorizada','different actor is rejected');
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into diet_tokens select 'revoked',token,plan_hash from public.prepare_diet_import('41000000-0000-0000-0000-000000000002',(select start_date from diet_dates),(select doc from weekly_plan));
set local role postgres;
update public.group_memberships set status='disabled' where id='43000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,true)',(select token from diet_tokens where label='revoked'),(select plan_hash from diet_tokens where label='revoked'),(select doc from weekly_plan)),'42501','Operación no autorizada','permission revoked after prepare is rejected');
set local role postgres;
update public.group_memberships set status='active' where id='43000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}',true);

select throws_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,true)',(select token from diet_tokens where label='valid'),(select plan_hash from diet_tokens where label='valid'),jsonb_set((select doc from weekly_plan),'{monday,0,title}','"altered"')),'22023','La confirmación no corresponde al plan revisado','same hash with different content is rejected');
select throws_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,false)',(select token from diet_tokens where label='valid'),(select plan_hash from diet_tokens where label='valid'),(select doc from weekly_plan)),'22023','Debe confirmar la sustitución','confirmed false is rejected');
select lives_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,true)',(select token from diet_tokens where label='valid'),(select plan_hash from diet_tokens where label='valid'),(select doc from weekly_plan)),'nutritionist applies reviewed plan');
select is((select count(*) from public.daily_plan where user_id='41000000-0000-0000-0000-000000000002' and date between (select start_date from diet_dates) and ((select start_date from diet_dates)+interval '3 months')::date-1),(((((select start_date from diet_dates)+interval '3 months')::date-(select start_date from diet_dates))*6))::bigint,'six meals are generated for every date');
select is((select count(*) from public.daily_plan where user_id='41000000-0000-0000-0000-000000000002' and date>=(select start_date from diet_dates) and is_completed),0::bigint,'all imported meals are incomplete');
select is((select title from public.daily_plan where user_id='41000000-0000-0000-0000-000000000002' and date=(select start_date from diet_dates) and meal_type='DESAYUNO'),'wednesday-DESAYUNO','calendar aligns a Wednesday');
select is((select count(*) from public.daily_plan where title='Far future'),0::bigint,'future rows beyond replacement window are deleted');
select results_eq($$select * from public.daily_plan where user_id='41000000-0000-0000-0000-000000000002' and date=public.diet_import_current_date()-1$$,$$select * from diet_baseline$$,'rows before start are preserved');
select throws_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,true)',(select token from diet_tokens where label='valid'),(select plan_hash from diet_tokens where label='valid'),(select doc from weekly_plan)),'22023','La confirmación ya fue utilizada','used token is rejected');

set local role postgres;
insert into diet_tokens select 'expired',token,plan_hash from public.prepare_diet_import('41000000-0000-0000-0000-000000000002',(select start_date from diet_dates),(select doc from weekly_plan));
update public.diet_import_confirmations set expires_at=now()-interval '1 second' where id=(select token from diet_tokens where label='expired');
set local role authenticated;
select throws_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,true)',(select token from diet_tokens where label='expired'),(select plan_hash from diet_tokens where label='expired'),(select doc from weekly_plan)),'22023','La confirmación ha caducado','expired token is rejected');

set local role postgres;
create function pg_temp.reject_diet_insert() returns trigger language plpgsql as $$begin if new.meal_type='MERIENDA' then raise exception 'forced diet failure'; end if; return new; end$$;
create trigger diet_atomic_failure before insert on public.daily_plan for each row execute function pg_temp.reject_diet_insert();
set local role authenticated;
insert into diet_tokens select 'rollback',token,plan_hash from public.prepare_diet_import('41000000-0000-0000-0000-000000000002',(select start_date from diet_dates),(select doc from weekly_plan));
select throws_ok(format('select public.apply_diet_import(%L,%L,%L::jsonb,true)',(select token from diet_tokens where label='rollback'),(select plan_hash from diet_tokens where label='rollback'),(select doc from weekly_plan)),'P0001','forced diet failure','insert failure rolls back replacement');
set local role postgres;
select is((select count(*) from public.daily_plan where user_id='41000000-0000-0000-0000-000000000002' and date>=(select start_date from diet_dates)),(((((select start_date from diet_dates)+interval '3 months')::date-(select start_date from diet_dates))*6))::bigint,'failed replacement restores existing rows');
select is((select used_at is null from public.diet_import_confirmations where id=(select token from diet_tokens where label='rollback')),true,'failed replacement leaves token unused');
drop trigger diet_atomic_failure on public.daily_plan;
drop function pg_temp.reject_diet_insert();

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002','{}'),'22023','Plan semanal no válido','missing day is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',(select doc || jsonb_build_object('extra','[]'::jsonb) from weekly_plan)),'22023','Plan semanal no válido','extra day is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,1}',(select doc->'monday'->0 from weekly_plan))),'22023','Contenido de comida no válido','duplicate meal is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,meal_type}','"BRUNCH"')),'22023','Contenido de comida no válido','wrong meal is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,title}','1')),'22023','Contenido de comida no válido','non-text field is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,title}',to_jsonb(repeat('x',201))))),'22023','Contenido de comida no válido','long title is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,ingredients}',to_jsonb(repeat('x',5001))))),'22023','Contenido de comida no válido','long ingredients are rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,recipe_url}','"javascript:alert(1)"'))),'22023','Contenido de comida no válido','invalid URL is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,recipe_url}','"http://"'))),'22023','Contenido de comida no válido','empty URL host is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,recipe_url}','"https:// example.com/path"'))),'22023','Contenido de comida no válido','URL containing spaces is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,recipe_url}',to_jsonb(E'https://example.com/a\nb')))),'22023','Contenido de comida no válido','URL containing control characters is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,recipe_url}','"https://"'))),'22023','Contenido de comida no válido','bare http URL is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,recipe_url}','"https://-bad.example/path"'))),'22023','Contenido de comida no válido','malformed DNS host is rejected');
select throws_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,recipe_url}','"http://localhost:70000/recipe"'))),'22023','Contenido de comida no válido','URL port is rejected unless validated');
select lives_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,recipe_url}','"http://localhost/recipe?id=42"'))),'http URL with DNS host and path is accepted');
select lives_ok(format('select public.prepare_diet_import(%L,public.diet_import_current_date(),%L::jsonb)','41000000-0000-0000-0000-000000000002',jsonb_set((select doc from weekly_plan),'{monday,0,recipe_url}','"https://www.instagram.com/reel/ABC_123/?utm_source=ig_web_copy_link"'))),'https Instagram URL with path and query is accepted');
select results_eq(format('select end_date from public.prepare_diet_import(%L,%L,%L::jsonb)','41000000-0000-0000-0000-000000000002','2027-01-31',(select doc from weekly_plan)),$$values ('2027-04-29'::date)$$,'month end uses three natural months');
select results_eq(format('select end_date from public.prepare_diet_import(%L,%L,%L::jsonb)','41000000-0000-0000-0000-000000000002','2027-11-30',(select doc from weekly_plan)),$$values ('2028-02-28'::date)$$,'leap year month end is correct');
select is((select count(*) from public.daily_plan where recipe_url='https://example.test/r'),(((((select start_date from diet_dates)+interval '3 months')::date-(select start_date from diet_dates))*6))::bigint,'recipe URL is accepted and inserted');
select is((select count(*) from public.diet_import_confirmations),0::bigint,'confirmation table remains inaccessible through RLS');
set local role postgres;
select results_eq($$select * from diet_history$$,$$select * from diet_history_before$$,'historical sentinel remains byte-identical');
select * from finish();
rollback;
