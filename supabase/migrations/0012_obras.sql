-- Permite rastrear a qué obra se destinó cada salida y liga salida → entrada (FIFO)

-- 1. Columna para ligar salida → su entrada de origen
ALTER TABLE movements
  ADD COLUMN IF NOT EXISTS source_movement_id uuid REFERENCES movements(id);

CREATE INDEX IF NOT EXISTS idx_movements_source_movement_id ON movements(source_movement_id);

-- 2. Actualizar create_movement: FIFO auto-link para salidas + heredar unit_cost
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
  p_supplier text DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_razon_social text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_movement_id uuid;
  v_user_id uuid := auth.uid();
  v_source_id uuid;
  v_effective_cost numeric;
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

  v_effective_cost := p_unit_cost;

  -- FIFO: buscar la entrada más antigua que surtió stock a esta ubicación
  IF p_type = 'salida' THEN
    SELECT m.id, m.unit_cost
    INTO v_source_id, v_effective_cost
    FROM movements m
    WHERE m.type = 'entrada'
      AND m.item_id = p_item_id
      AND m.destination_location_id = p_origin_location_id
    ORDER BY m.created_at ASC
    LIMIT 1;

    -- unit_cost explícito tiene precedencia sobre el heredado
    IF p_unit_cost IS NOT NULL THEN
      v_effective_cost := p_unit_cost;
    END IF;
  END IF;

  INSERT INTO movements (
    type, item_id, quantity,
    origin_location_id, destination_location_id,
    notes, unit_cost, reference_number,
    responsible_id, created_by, supplier, recipient_name, razon_social,
    source_movement_id
  ) VALUES (
    p_type, p_item_id, p_quantity,
    p_origin_location_id, p_destination_location_id,
    p_notes, v_effective_cost, p_reference_number,
    p_responsible_id, v_user_id, p_supplier, p_recipient_name, p_razon_social,
    v_source_id
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
