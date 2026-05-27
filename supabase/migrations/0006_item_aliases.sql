-- ============================================================
-- ITEM ALIASES — Nombres alternativos por artículo
-- ============================================================
-- Permite registrar cómo llaman los proveedores a cada artículo.
-- Ejemplo: "CEM-50G, cemento gris, cem 50" para el artículo "Cemento gris 50kg".
-- El escaneo de facturas usa estos nombres para hacer match automático.

ALTER TABLE items ADD COLUMN IF NOT EXISTS aliases text DEFAULT NULL;
