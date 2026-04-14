-- ============================================================
-- PURCHASE ORDERS — Órdenes de compra
-- ============================================================

-- Asegurar columna supplier en movements (puede ya existir)
ALTER TABLE movements ADD COLUMN IF NOT EXISTS supplier TEXT;

-- Actualizar create_movement para incluir supplier
CREATE OR REPLACE FUNCTION create_movement(
  p_type movement_type,
  p_item_id uuid,
  p_quantity numeric,
  p_origin_location_id uuid DEFAULT NULL,
  p_destination_location_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_reference_number text DEFAULT NULL,
  p_responsible_id uuid DEFAULT NULL,
  p_supplier text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_movement_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF p_type = 'entrada' AND p_destination_location_id IS NULL THEN
    RAISE EXCEPTION 'Una entrada requiere ubicación destino';
  END IF;
  IF p_type = 'salida' AND p_origin_location_id IS NULL THEN
    RAISE EXCEPTION 'Una salida requiere ubicación origen';
  END IF;
  IF p_type = 'transferencia' AND (p_origin_location_id IS NULL OR p_destination_location_id IS NULL) THEN
    RAISE EXCEPTION 'Una transferencia requiere origen y destino';
  END IF;
  IF p_type = 'ajuste' AND p_origin_location_id IS NULL THEN
    RAISE EXCEPTION 'Un ajuste requiere ubicación';
  END IF;

  INSERT INTO movements (
    type, item_id, quantity,
    origin_location_id, destination_location_id,
    notes, unit_cost, reference_number,
    responsible_id, created_by, supplier
  ) VALUES (
    p_type, p_item_id, p_quantity,
    p_origin_location_id, p_destination_location_id,
    p_notes, p_unit_cost, p_reference_number,
    p_responsible_id, v_user_id, p_supplier
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nuevo rol: trabajador
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'trabajador';

-- ============================================================
-- TABLA: purchase_requests
-- ============================================================
CREATE TABLE purchase_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID NOT NULL REFERENCES profiles(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'en_proceso', 'completada', 'cancelada')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: purchase_request_items
-- ============================================================
CREATE TABLE purchase_request_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id),        -- null si artículo no está en catálogo
  item_name TEXT NOT NULL,                  -- nombre libre o del catálogo
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'comprado')),
  assigned_supplier TEXT,                   -- proveedor asignado por el comprador
  actual_unit_cost NUMERIC,                 -- precio real pagado
  purchased_quantity NUMERIC,               -- cantidad real comprada
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRIGGER: updated_at en purchase_requests
-- ============================================================
CREATE OR REPLACE FUNCTION update_purchase_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_request_updated_at
  BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION update_purchase_request_timestamp();

-- ============================================================
-- TRIGGER: completar solicitud cuando todos sus items son comprados
-- ============================================================
CREATE OR REPLACE FUNCTION check_request_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'comprado' THEN
    UPDATE purchase_requests
    SET status = 'completada', updated_at = NOW()
    WHERE id = NEW.request_id
      AND NOT EXISTS (
        SELECT 1 FROM purchase_request_items
        WHERE request_id = NEW.request_id
          AND status = 'pendiente'
          AND id != NEW.id
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_request_completion
  AFTER UPDATE ON purchase_request_items
  FOR EACH ROW EXECUTE FUNCTION check_request_completion();

-- ============================================================
-- VISTA: historial de proveedores por artículo
-- ============================================================
CREATE OR REPLACE VIEW supplier_item_history AS
SELECT
  m.supplier,
  m.item_id,
  i.name AS item_name,
  i.unit,
  m.unit_cost,
  m.created_at
FROM movements m
JOIN items i ON i.id = m.item_id
WHERE m.type = 'entrada'
  AND m.supplier IS NOT NULL
  AND m.item_id IS NOT NULL
  AND m.unit_cost IS NOT NULL
ORDER BY m.created_at DESC;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;

-- purchase_requests: trabajador ve solo los suyos; admin/supervisor ve todos
CREATE POLICY "pr_select" ON purchase_requests FOR SELECT
  USING (
    created_by = auth.uid()
    OR get_my_role() IN ('admin', 'supervisor')
  );

CREATE POLICY "pr_insert" ON purchase_requests FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "pr_update" ON purchase_requests FOR UPDATE
  USING (get_my_role() IN ('admin', 'supervisor'));

-- purchase_request_items: heredan acceso del request padre
CREATE POLICY "pri_select" ON purchase_request_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_items.request_id
        AND (pr.created_by = auth.uid() OR get_my_role() IN ('admin', 'supervisor'))
    )
  );

CREATE POLICY "pri_insert" ON purchase_request_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_items.request_id
        AND pr.created_by = auth.uid()
    )
  );

CREATE POLICY "pri_update" ON purchase_request_items FOR UPDATE
  USING (get_my_role() IN ('admin', 'supervisor'));

-- Restringir creación de movimientos a admin/supervisor (trabajadores solo hacen pedidos)
DROP POLICY IF EXISTS "movements_insert" ON movements;
CREATE POLICY "movements_insert" ON movements FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'supervisor'));
