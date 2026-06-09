CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fuel_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('diesel', 'gasolina')),
  liters NUMERIC(10,2) NOT NULL CHECK (liters > 0),
  total_cost NUMERIC(10,2) NOT NULL CHECK (total_cost > 0),
  price_per_liter NUMERIC(10,4) GENERATED ALWAYS AS (total_cost / liters) STORED,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_source TEXT NOT NULL DEFAULT 'otro' CHECK (payment_source IN ('fondo', 'otro')),
  cash_fund_id UUID REFERENCES cash_funds(id),
  photo_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read vehicles" ON vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert vehicles" ON vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update vehicles" ON vehicles FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated read fuel_entries" ON fuel_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert fuel_entries" ON fuel_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update fuel_entries" ON fuel_entries FOR UPDATE TO authenticated USING (true);

INSERT INTO vehicles (name) VALUES
  ('Tonelada'),
  ('Retroexcavadora'),
  ('Dompe'),
  ('Partner');
