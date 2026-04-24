-- Link cash funds to a specific user (one fund per user)
alter table cash_funds
  add column user_id uuid references profiles(id) unique;
