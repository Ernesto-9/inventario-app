-- Columna variant_info en items (especificación del artículo, ej: "M6 × 20mm, Zinc")
ALTER TABLE items ADD COLUMN IF NOT EXISTS variant_info text DEFAULT NULL;
