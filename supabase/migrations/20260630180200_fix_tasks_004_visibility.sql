-- Bug: 004 no podía ver, crear ni editar tareas asignadas a 001 (su único caso de
-- uso en el módulo). Causa: las políticas de `tasks` y `can_see_task()` resuelven
-- el id de 001 con `select id from profiles where username = '001'` — una
-- subconsulta normal, que corre bajo el RLS del usuario que llama. La policy
-- `profiles_select` solo deja ver la fila propia (salvo admin), así que para 004
-- esa subconsulta no devuelve nada y la condición nunca se cumple.
--
-- Fix: helper security definer que hace el lookup sin pasar por RLS de profiles.

create or replace function get_profile_id_by_username(p_username text)
returns uuid as $$
  select id from profiles where username = p_username
$$ language sql security definer stable;

drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks
  for select to authenticated using (
    get_my_role() = 'admin'
    or assigned_to_profile = auth.uid()
    or (get_my_username() = '004' and assigned_to_profile = get_profile_id_by_username('001'))
  );

drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks
  for insert to authenticated with check (
    created_by = auth.uid() and (
      get_my_role() = 'admin'
      or (get_my_username() in ('003', '005') and assigned_to_profile = auth.uid())
      or (get_my_username() = '004' and assigned_to_profile = get_profile_id_by_username('001'))
    )
  );

drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks
  for update to authenticated
  using (
    get_my_role() = 'admin'
    or assigned_to_profile = auth.uid()
    or (get_my_username() = '004' and assigned_to_profile = get_profile_id_by_username('001'))
  )
  with check (
    get_my_role() = 'admin'
    or assigned_to_profile = auth.uid()
    or (get_my_username() = '004' and assigned_to_profile = get_profile_id_by_username('001'))
  );

create or replace function can_see_task(p_task_id uuid)
returns boolean as $$
  select exists (
    select 1 from tasks t
    where t.id = p_task_id
      and (
        get_my_role() = 'admin'
        or t.assigned_to_profile = auth.uid()
        or (get_my_username() = '004' and t.assigned_to_profile = get_profile_id_by_username('001'))
      )
  )
$$ language sql security definer stable;
