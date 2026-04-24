-- Reverse balance when a cash transaction is deleted
create or replace function reverse_cash_balance()
returns trigger as $$
begin
  if OLD.type = 'depósito' then
    update cash_funds set balance = balance - OLD.amount where id = OLD.fund_id;
  elsif OLD.type = 'gasto' then
    update cash_funds set balance = balance + OLD.amount where id = OLD.fund_id;
  end if;
  return OLD;
end;
$$ language plpgsql security definer;

create trigger trg_reverse_cash
  after delete on cash_transactions
  for each row execute function reverse_cash_balance();
