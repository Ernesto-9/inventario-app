alter table profiles add column if not exists username text unique;

update profiles p
set username = split_part(u.email, '@', 1)
from auth.users u
where u.id = p.id
  and p.username is null;

create or replace function get_my_username()
returns text as $$
  select username from profiles where id = auth.uid()
$$ language sql security definer stable;
