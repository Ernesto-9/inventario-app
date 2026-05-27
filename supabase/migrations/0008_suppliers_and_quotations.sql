-- ============================================================
-- SUPPLIERS + COTIZACIONES
-- ============================================================

-- ============================================================
-- TABLA: suppliers — catálogo formal de proveedores
-- ============================================================
create table suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  phone text,
  whatsapp_phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_suppliers_name on suppliers(name);

-- Trigger updated_at
create or replace function update_supplier_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_supplier_updated_at
  before update on suppliers
  for each row execute function update_supplier_timestamp();

-- ============================================================
-- TABLA: item_suppliers — junction item ↔ proveedor
-- ============================================================
create table item_suppliers (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(item_id, supplier_id)
);

create index idx_item_suppliers_item on item_suppliers(item_id);
create index idx_item_suppliers_supplier on item_suppliers(supplier_id);

-- ============================================================
-- TABLA: quotations — listas de cotización
-- ============================================================
create table quotations (
  id uuid primary key default uuid_generate_v4(),
  name text,
  notes text,
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_quotations_created_by on quotations(created_by);
create index idx_quotations_status on quotations(status);

create or replace function update_quotation_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_quotation_updated_at
  before update on quotations
  for each row execute function update_quotation_timestamp();

-- ============================================================
-- TABLA: quotation_items — renglones de la cotización
-- ============================================================
create table quotation_items (
  id uuid primary key default uuid_generate_v4(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unit text,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_quotation_items_quotation on quotation_items(quotation_id);
create index idx_quotation_items_item on quotation_items(item_id);

-- ============================================================
-- BOOTSTRAP: poblar suppliers e item_suppliers desde datos existentes
-- ============================================================

-- 1. Crear un registro de proveedor por cada nombre distinto en movimientos
insert into suppliers (name)
select distinct trim(supplier)
from movements
where supplier is not null
  and trim(supplier) <> ''
on conflict (name) do nothing;

-- 2. Ligar items con proveedores según el historial de entradas
insert into item_suppliers (item_id, supplier_id)
select distinct m.item_id, s.id
from movements m
join suppliers s on s.name = trim(m.supplier)
where m.type = 'entrada'
  and m.item_id is not null
  and m.supplier is not null
on conflict (item_id, supplier_id) do nothing;

-- ============================================================
-- TRIGGER: mantener item_suppliers al día con nuevos movimientos
-- ============================================================
create or replace function sync_item_supplier_from_movement()
returns trigger as $$
declare
  v_supplier_id uuid;
begin
  if new.type = 'entrada'
     and new.supplier is not null
     and trim(new.supplier) <> ''
     and new.item_id is not null then

    select id into v_supplier_id
    from suppliers
    where name = trim(new.supplier)
    limit 1;

    if v_supplier_id is not null then
      insert into item_suppliers (item_id, supplier_id)
      values (new.item_id, v_supplier_id)
      on conflict (item_id, supplier_id) do nothing;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_movements_sync_item_supplier
  after insert or update on movements
  for each row execute function sync_item_supplier_from_movement();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table suppliers enable row level security;
alter table item_suppliers enable row level security;
alter table quotations enable row level security;
alter table quotation_items enable row level security;

-- suppliers
create policy "suppliers_select" on suppliers for select
  using (auth.uid() is not null);

create policy "suppliers_insert" on suppliers for insert
  with check (get_my_role() in ('admin', 'supervisor'));

create policy "suppliers_update" on suppliers for update
  using (get_my_role() in ('admin', 'supervisor'));

create policy "suppliers_delete" on suppliers for delete
  using (get_my_role() in ('admin', 'supervisor'));

-- item_suppliers
create policy "item_suppliers_select" on item_suppliers for select
  using (auth.uid() is not null);

create policy "item_suppliers_insert" on item_suppliers for insert
  with check (get_my_role() in ('admin', 'supervisor'));

create policy "item_suppliers_update" on item_suppliers for update
  using (get_my_role() in ('admin', 'supervisor'));

create policy "item_suppliers_delete" on item_suppliers for delete
  using (get_my_role() in ('admin', 'supervisor'));

-- quotations
create policy "quotations_select" on quotations for select
  using (get_my_role() in ('admin', 'supervisor'));

create policy "quotations_insert" on quotations for insert
  with check (get_my_role() in ('admin', 'supervisor'));

create policy "quotations_update" on quotations for update
  using (get_my_role() in ('admin', 'supervisor'));

create policy "quotations_delete" on quotations for delete
  using (get_my_role() in ('admin', 'supervisor'));

-- quotation_items
create policy "quotation_items_select" on quotation_items for select
  using (
    exists (
      select 1 from quotations q
      where q.id = quotation_items.quotation_id
        and get_my_role() in ('admin', 'supervisor')
    )
  );

create policy "quotation_items_insert" on quotation_items for insert
  with check (get_my_role() in ('admin', 'supervisor'));

create policy "quotation_items_update" on quotation_items for update
  using (get_my_role() in ('admin', 'supervisor'));

create policy "quotation_items_delete" on quotation_items for delete
  using (get_my_role() in ('admin', 'supervisor'));
