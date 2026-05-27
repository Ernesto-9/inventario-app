-- Expandir el CHECK constraint de razon_social para incluir cuentas de colaboradores

ALTER TABLE movements
  DROP CONSTRAINT IF EXISTS movements_razon_social_check;

ALTER TABLE movements
  ADD CONSTRAINT movements_razon_social_check
    CHECK (razon_social IN ('IPC', 'Empresarial', 'Arrendamiento', 'Naian', 'Carolina', 'Jr', 'Adriana'));
