-- Agrega campo track_stock a items
-- Solo los artículos con track_stock = true aparecen en alertas de stock bajo

alter table items
  add column if not exists track_stock boolean not null default false;

-- Actualiza la vista para considerar track_stock
create or replace view stock_totals as
  select
    i.id as item_id,
    i.name as item_name,
    i.unit,
    i.min_stock,
    i.sku,
    i.track_stock,
    c.name as category_name,
    c.color as category_color,
    coalesce(sum(s.quantity), 0) as total_quantity,
    case
      when i.track_stock and coalesce(sum(s.quantity), 0) <= i.min_stock
      then true
      else false
    end as is_low_stock
  from items i
  left join stock s on s.item_id = i.id
  left join categories c on c.id = i.category_id
  where i.is_active = true
  group by i.id, i.name, i.unit, i.min_stock, i.sku, i.track_stock, c.name, c.color;
