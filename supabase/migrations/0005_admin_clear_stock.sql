-- ============================================================
-- ADMIN CLEAR STOCK — Eliminar stock de una ubicación (solo admin)
-- ============================================================

-- Función para que el admin elimine el stock de un artículo en una ubicación
-- sin pasar por el formulario de ajuste. Se usa para corregir entradas erróneas.
-- No crea movimiento (el CHECK quantity > 0 lo impediría con 0).
CREATE OR REPLACE FUNCTION admin_clear_stock(
  p_item_id uuid,
  p_location_id uuid
)
RETURNS void AS $$
BEGIN
  IF get_my_role() != 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden ejecutar esta acción';
  END IF;

  DELETE FROM stock
  WHERE item_id = p_item_id
    AND location_id = p_location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
