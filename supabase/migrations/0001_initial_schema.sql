-- ============================================================
-- INVENTARIO APP — Esquema inicial
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type location_type as enum ('almacén', 'obra', 'vehículo', 'empleado', 'otro');
create type movement_type as enum ('entrada', 'salida', 'transferencia', 'ajuste');
create type user_role as enum ('admin', 'supervisor');
create type attachment_type as enum ('foto', 'factura', 'documento');

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'supervisor',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- LOCATIONS
-- ============================================================
create table locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type location_type not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- CATEGORIES
-- ============================================================
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  color text not null default '#6B7280',
  created_at timestamptz not null default now()
);

-- ============================================================
-- ITEMS (catálogo de artículos)
-- ============================================================
create table items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  sku text unique,
  unit text not null default 'pieza',         -- pieza, kg, litro, metro, caja, etc.
  category_id uuid references categories(id) on delete set null,
  min_stock numeric not null default 0,        -- stock mínimo de alerta
  photo_url text,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- STOCK (cantidad actual por item + ubicación)
-- ============================================================
create table stock (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique(item_id, location_id)
);

-- ============================================================
-- MOVEMENTS
-- ============================================================
create table movements (
  id uuid primary key default uuid_generate_v4(),
  type movement_type not null,
  item_id uuid not null references items(id),
  quantity numeric not null check (quantity > 0),

  -- Para entradas: solo origin_location_id = null, destination_location_id = destino
  -- Para salidas: origin_location_id = origen, destination_location_id = null
  -- Para transferencias: ambos obligatorios
  -- Para ajustes: solo origin_location_id = ubicación afectada
  origin_location_id uuid references locations(id),
  destination_location_id uuid references locations(id),

  notes text,
  unit_cost numeric,                          -- costo unitario (para entradas con factura)
  reference_number text,                      -- número de factura/remisión

  responsible_id uuid references profiles(id), -- quién hizo el movimiento
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- MOVEMENT ATTACHMENTS (fotos, facturas, docs)
-- ============================================================
create table movement_attachments (
  id uuid primary key default uuid_generate_v4(),
  movement_id uuid not null references movements(id) on delete cascade,
  type attachment_type not null default 'foto',
  file_url text not null,
  file_name text not null,
  file_size integer,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- ITEM ATTACHMENTS (fotos de referencia del artículo)
-- ============================================================
create table item_attachments (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(id) on delete cascade,
  type attachment_type not null default 'foto',
  file_url text not null,
  file_name text not null,
  file_size integer,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- CASH FUNDS (cajas chicas)
-- ============================================================
create table cash_funds (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  location_id uuid references locations(id),
  balance numeric not null default 0,
  description text,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- CASH TRANSACTIONS
-- ============================================================
create table cash_transactions (
  id uuid primary key default uuid_generate_v4(),
  fund_id uuid not null references cash_funds(id),
  type text not null check (type in ('depósito', 'gasto')),
  amount numeric not null check (amount > 0),
  description text not null,
  movement_id uuid references movements(id),   -- link opcional a movimiento de inventario
  reference_number text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- TRIGGER: actualizar stock automáticamente en cada movimiento
-- ============================================================
create or replace function update_stock_on_movement()
returns trigger as $$
begin
  -- ENTRADA o AJUSTE positivo: suma al destino
  if NEW.type = 'entrada' then
    insert into stock (item_id, location_id, quantity)
      values (NEW.item_id, NEW.destination_location_id, NEW.quantity)
    on conflict (item_id, location_id)
      do update set quantity = stock.quantity + NEW.quantity,
                    updated_at = now();

  -- SALIDA: resta del origen
  elsif NEW.type = 'salida' then
    insert into stock (item_id, location_id, quantity)
      values (NEW.item_id, NEW.origin_location_id, 0)
    on conflict (item_id, location_id) do nothing;

    update stock
      set quantity = greatest(0, quantity - NEW.quantity),
          updated_at = now()
      where item_id = NEW.item_id
        and location_id = NEW.origin_location_id;

  -- TRANSFERENCIA: resta del origen, suma al destino
  elsif NEW.type = 'transferencia' then
    insert into stock (item_id, location_id, quantity)
      values (NEW.item_id, NEW.origin_location_id, 0)
    on conflict (item_id, location_id) do nothing;

    update stock
      set quantity = greatest(0, quantity - NEW.quantity),
          updated_at = now()
      where item_id = NEW.item_id
        and location_id = NEW.origin_location_id;

    insert into stock (item_id, location_id, quantity)
      values (NEW.item_id, NEW.destination_location_id, NEW.quantity)
    on conflict (item_id, location_id)
      do update set quantity = stock.quantity + NEW.quantity,
                    updated_at = now();

  -- AJUSTE: sobreescribe la cantidad en la ubicación de origen
  elsif NEW.type = 'ajuste' then
    insert into stock (item_id, location_id, quantity)
      values (NEW.item_id, NEW.origin_location_id, NEW.quantity)
    on conflict (item_id, location_id)
      do update set quantity = NEW.quantity,
                    updated_at = now();
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_update_stock
  after insert on movements
  for each row execute function update_stock_on_movement();

-- ============================================================
-- TRIGGER: actualizar saldo de caja en cada transacción
-- ============================================================
create or replace function update_cash_balance()
returns trigger as $$
begin
  if NEW.type = 'depósito' then
    update cash_funds set balance = balance + NEW.amount where id = NEW.fund_id;
  elsif NEW.type = 'gasto' then
    update cash_funds set balance = balance - NEW.amount where id = NEW.fund_id;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_update_cash
  after insert on cash_transactions
  for each row execute function update_cash_balance();

-- ============================================================
-- TRIGGER: crear perfil automáticamente al registrar usuario
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, role)
  values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.email),
    coalesce((NEW.raw_user_meta_data->>'role')::user_role, 'supervisor')
  );
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- RPC: create_movement (transacción segura desde el cliente)
-- ============================================================
create or replace function create_movement(
  p_type movement_type,
  p_item_id uuid,
  p_quantity numeric,
  p_origin_location_id uuid default null,
  p_destination_location_id uuid default null,
  p_notes text default null,
  p_unit_cost numeric default null,
  p_reference_number text default null,
  p_responsible_id uuid default null
)
returns uuid as $$
declare
  v_movement_id uuid;
  v_user_id uuid := auth.uid();
begin
  -- Validaciones básicas
  if p_type = 'entrada' and p_destination_location_id is null then
    raise exception 'Una entrada requiere ubicación destino';
  end if;
  if p_type = 'salida' and p_origin_location_id is null then
    raise exception 'Una salida requiere ubicación origen';
  end if;
  if p_type = 'transferencia' and (p_origin_location_id is null or p_destination_location_id is null) then
    raise exception 'Una transferencia requiere origen y destino';
  end if;
  if p_type = 'ajuste' and p_origin_location_id is null then
    raise exception 'Un ajuste requiere ubicación';
  end if;

  insert into movements (
    type, item_id, quantity,
    origin_location_id, destination_location_id,
    notes, unit_cost, reference_number,
    responsible_id, created_by
  ) values (
    p_type, p_item_id, p_quantity,
    p_origin_location_id, p_destination_location_id,
    p_notes, p_unit_cost, p_reference_number,
    p_responsible_id, v_user_id
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- VIEWS
-- ============================================================

-- Stock total por artículo (suma de todas las ubicaciones)
create or replace view stock_totals as
  select
    i.id as item_id,
    i.name as item_name,
    i.unit,
    i.min_stock,
    i.sku,
    c.name as category_name,
    c.color as category_color,
    coalesce(sum(s.quantity), 0) as total_quantity,
    case when coalesce(sum(s.quantity), 0) <= i.min_stock then true else false end as is_low_stock
  from items i
  left join stock s on s.item_id = i.id
  left join categories c on c.id = i.category_id
  where i.is_active = true
  group by i.id, i.name, i.unit, i.min_stock, i.sku, c.name, c.color;

-- Stock detallado por artículo + ubicación
create or replace view stock_by_location as
  select
    s.id,
    s.item_id,
    i.name as item_name,
    i.unit,
    i.sku,
    s.location_id,
    l.name as location_name,
    l.type as location_type,
    s.quantity,
    s.updated_at
  from stock s
  join items i on i.id = s.item_id
  join locations l on l.id = s.location_id
  where i.is_active = true;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table locations enable row level security;
alter table categories enable row level security;
alter table items enable row level security;
alter table stock enable row level security;
alter table movements enable row level security;
alter table movement_attachments enable row level security;
alter table item_attachments enable row level security;
alter table cash_funds enable row level security;
alter table cash_transactions enable row level security;

-- Helper: obtener rol del usuario actual
create or replace function get_my_role()
returns user_role as $$
  select role from profiles where id = auth.uid()
$$ language sql security definer stable;

-- PROFILES: cada usuario ve su propio perfil; admin ve todos
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or get_my_role() = 'admin');

create policy "profiles_update_own" on profiles for update
  using (id = auth.uid());

-- LOCATIONS: todos los auth pueden leer; solo admin puede crear/editar
create policy "locations_select" on locations for select
  using (auth.uid() is not null);

create policy "locations_insert" on locations for insert
  with check (get_my_role() = 'admin');

create policy "locations_update" on locations for update
  using (get_my_role() = 'admin');

-- CATEGORIES: todos pueden leer; solo admin puede crear/editar
create policy "categories_select" on categories for select
  using (auth.uid() is not null);

create policy "categories_insert" on categories for insert
  with check (get_my_role() = 'admin');

create policy "categories_update" on categories for update
  using (get_my_role() = 'admin');

-- ITEMS: todos leen; solo admin puede crear/editar catálogo
create policy "items_select" on items for select
  using (auth.uid() is not null);

create policy "items_insert" on items for insert
  with check (get_my_role() = 'admin');

create policy "items_update" on items for update
  using (get_my_role() = 'admin');

-- STOCK: todos pueden leer
create policy "stock_select" on stock for select
  using (auth.uid() is not null);

-- MOVEMENTS: todos pueden leer y crear (supervisor crea movimientos)
create policy "movements_select" on movements for select
  using (auth.uid() is not null);

create policy "movements_insert" on movements for insert
  with check (auth.uid() is not null);

-- Solo admin puede editar/borrar movimientos
create policy "movements_update" on movements for update
  using (get_my_role() = 'admin');

-- ATTACHMENTS: todos pueden ver y subir
create policy "movement_attachments_select" on movement_attachments for select
  using (auth.uid() is not null);

create policy "movement_attachments_insert" on movement_attachments for insert
  with check (auth.uid() is not null);

create policy "item_attachments_select" on item_attachments for select
  using (auth.uid() is not null);

create policy "item_attachments_insert" on item_attachments for insert
  with check (auth.uid() is not null);

-- CASH: todos pueden leer; solo admin gestiona
create policy "cash_funds_select" on cash_funds for select
  using (auth.uid() is not null);

create policy "cash_funds_admin" on cash_funds for all
  using (get_my_role() = 'admin');

create policy "cash_transactions_select" on cash_transactions for select
  using (auth.uid() is not null);

create policy "cash_transactions_insert" on cash_transactions for insert
  with check (auth.uid() is not null);

-- ============================================================
-- SEED DATA (categorías y ubicación inicial)
-- ============================================================
insert into categories (name, color) values
  ('Materiales de construcción', '#EF4444'),
  ('Herramientas manuales', '#F97316'),
  ('Herramientas eléctricas', '#EAB308'),
  ('Plomería', '#22C55E'),
  ('Electricidad', '#3B82F6'),
  ('Pintura y acabados', '#A855F7'),
  ('Equipo de seguridad', '#EC4899'),
  ('Maquinaria', '#6B7280'),
  ('Insumos de oficina', '#14B8A6');
