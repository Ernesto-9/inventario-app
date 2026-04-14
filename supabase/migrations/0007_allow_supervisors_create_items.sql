-- Allow any authenticated user to create items (not just admin)
drop policy if exists "items_insert" on items;
create policy "items_insert" on items for insert
  with check (auth.uid() is not null);
