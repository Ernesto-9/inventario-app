-- El enum user_role nunca tuvo 'trabajador' aplicado en producción, pese a existir
-- en supabase/migrations/0003_purchase_orders.sql (ALTER TYPE ... ADD VALUE) y ser
-- asumido por todo el código (types/database.ts, layout.tsx, MobileNav.tsx, CLAUDE.md).
alter type user_role add value if not exists 'trabajador';
