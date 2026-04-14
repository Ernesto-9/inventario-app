-- Agrega campo recipient_name a movements para registrar a quién se entrega en salidas

ALTER TABLE movements ADD COLUMN IF NOT EXISTS recipient_name text;

-- Actualizar create_movement para incluir recipient_name
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
  p_recipient_name text DEFAULT NULL
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
    responsible_id, created_by, supplier, recipient_name
  ) VALUES (
    p_type, p_item_id, p_quantity,
    p_origin_location_id, p_destination_location_id,
    p_notes, p_unit_cost, p_reference_number,
    p_responsible_id, v_user_id, p_supplier, p_recipient_name
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
