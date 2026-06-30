create type task_status as enum ('pendiente', 'en_progreso', 'completada', 'vencida');
create type task_priority as enum ('alta', 'media', 'baja');

-- external_actors
create table external_actors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('arquitecto', 'contratista', 'proveedor', 'otro')),
  phone text,
  company text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status task_status not null default 'pendiente',
  priority task_priority not null default 'media',
  due_date date not null,
  assigned_to_profile uuid references profiles(id),
  assigned_to_external uuid references external_actors(id),
  location_id uuid references locations(id),
  parent_task_id uuid references tasks(id) on delete cascade,
  created_by uuid not null references profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((assigned_to_profile is null) <> (assigned_to_external is null))
);

-- task_history
create table task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  changed_by uuid references profiles(id),
  field_changed text,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

-- push_subscriptions (Fase 5 — tabla creada ahora, uso posterior)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- indexes
create index idx_tasks_assigned_to_profile on tasks(assigned_to_profile);
create index idx_tasks_assigned_to_external on tasks(assigned_to_external);
create index idx_tasks_location_id on tasks(location_id);
create index idx_tasks_parent_task_id on tasks(parent_task_id);
create index idx_tasks_due_date on tasks(due_date);
create index idx_tasks_status on tasks(status);
create index idx_task_history_task_id on task_history(task_id);

-- trigger: updated_at en tasks
create or replace function update_task_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_task_updated_at
  before update on tasks
  for each row execute function update_task_timestamp();

-- trigger: prohibir sub-subtareas (solo 1 nivel)
create or replace function check_task_depth()
returns trigger as $$
begin
  if new.parent_task_id is not null then
    -- el padre ya es subtarea → profundidad hacia arriba
    perform 1 from tasks where id = new.parent_task_id and parent_task_id is not null;
    if found then
      raise exception 'Sub-subtareas no permitidas: solo se permite un nivel de profundidad';
    end if;
    -- esta tarea ya tiene hijos → profundidad hacia abajo
    perform 1 from tasks where parent_task_id = new.id;
    if found then
      raise exception 'Esta tarea ya tiene subtareas: no puede convertirse en subtarea';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_tasks_no_subsubtask
  before insert or update on tasks
  for each row execute function check_task_depth();

-- trigger: enforce column-level business rules en UPDATE (defensa en profundidad vs bypass de API)
create or replace function enforce_task_update_rules()
returns trigger as $$
declare
  v_role text;
  v_username text;
begin
  select role, username into v_role, v_username from profiles where id = auth.uid();

  if v_role = 'admin' then
    return new;
  end if;

  if new.due_date is distinct from old.due_date then
    raise exception 'Solo admin puede cambiar la fecha límite';
  end if;

  if new.status is distinct from old.status and old.assigned_to_external is not null and v_username <> '002' then
    raise exception 'Solo el perfil 002 puede actualizar el progreso de tareas de externos';
  end if;

  if new.assigned_to_profile is distinct from old.assigned_to_profile
     or new.assigned_to_external is distinct from old.assigned_to_external
     or new.parent_task_id is distinct from old.parent_task_id
     or new.created_by is distinct from old.created_by then
    raise exception 'No tienes permiso para reasignar o mover esta tarea';
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_tasks_enforce_update_rules
  before update on tasks
  for each row execute function enforce_task_update_rules();

-- función para marcar vencidas (agendada en Fase 5)
create or replace function mark_overdue_tasks()
returns void as $$
  update tasks
  set status = 'vencida'::task_status
  where due_date < current_date
    and status in ('pendiente', 'en_progreso');
$$ language sql security definer;

-- función que devuelve conteo de vencidas según usuario (para badge)
create or replace function get_my_overdue_count()
returns integer as $$
declare
  v_role text;
  v_username text;
  v_uid uuid;
  v_count integer;
begin
  v_uid := auth.uid();
  select role, username into v_role, v_username from profiles where id = v_uid;

  if v_role = 'admin' then
    select count(*) into v_count
    from tasks
    where due_date < current_date and status in ('pendiente', 'en_progreso');
  elsif v_username = '004' then
    select count(*) into v_count
    from tasks t
    join profiles p on p.id = t.assigned_to_profile
    where p.username = '001'
      and t.due_date < current_date
      and t.status in ('pendiente', 'en_progreso');
  else
    select count(*) into v_count
    from tasks
    where assigned_to_profile = v_uid
      and due_date < current_date
      and status in ('pendiente', 'en_progreso');
  end if;

  return coalesce(v_count, 0);
end;
$$ language plpgsql security definer stable;

-- RLS
alter table external_actors enable row level security;
alter table tasks enable row level security;
alter table task_history enable row level security;
alter table push_subscriptions enable row level security;

-- external_actors
create policy "ea_select" on external_actors
  for select to authenticated using (true);
create policy "ea_insert" on external_actors
  for insert to authenticated with check (get_my_role() = 'admin');
create policy "ea_update" on external_actors
  for update to authenticated using (get_my_role() = 'admin') with check (get_my_role() = 'admin');
create policy "ea_delete" on external_actors
  for delete to authenticated using (get_my_role() = 'admin');

-- tasks
create policy "tasks_select" on tasks
  for select to authenticated using (
    get_my_role() = 'admin'
    or assigned_to_profile = auth.uid()
    or (get_my_username() = '004' and assigned_to_profile = (select id from profiles where username = '001'))
  );
create policy "tasks_insert" on tasks
  for insert to authenticated with check (
    created_by = auth.uid() and (
      get_my_role() = 'admin'
      or (get_my_username() in ('003', '005') and assigned_to_profile = auth.uid())
      or (get_my_username() = '004' and assigned_to_profile = (select id from profiles where username = '001'))
    )
  );
create policy "tasks_update" on tasks
  for update to authenticated
  using (
    get_my_role() = 'admin'
    or assigned_to_profile = auth.uid()
    or (get_my_username() = '004' and assigned_to_profile = (select id from profiles where username = '001'))
  )
  with check (
    get_my_role() = 'admin'
    or assigned_to_profile = auth.uid()
    or (get_my_username() = '004' and assigned_to_profile = (select id from profiles where username = '001'))
  );
create policy "tasks_delete" on tasks
  for delete to authenticated using (get_my_role() = 'admin');

-- task_history: solo accesible para tareas que el usuario puede ver
create or replace function can_see_task(p_task_id uuid)
returns boolean as $$
  select exists (
    select 1 from tasks t
    where t.id = p_task_id
      and (
        get_my_role() = 'admin'
        or t.assigned_to_profile = auth.uid()
        or (get_my_username() = '004' and t.assigned_to_profile = (select id from profiles where username = '001'))
      )
  )
$$ language sql security definer stable;

create policy "th_select" on task_history
  for select to authenticated using (can_see_task(task_id));
create policy "th_insert" on task_history
  for insert to authenticated with check (changed_by = auth.uid() and can_see_task(task_id));

-- push_subscriptions
create policy "ps_select" on push_subscriptions
  for select to authenticated using (profile_id = auth.uid());
create policy "ps_insert" on push_subscriptions
  for insert to authenticated with check (profile_id = auth.uid());
create policy "ps_delete" on push_subscriptions
  for delete to authenticated using (profile_id = auth.uid());
