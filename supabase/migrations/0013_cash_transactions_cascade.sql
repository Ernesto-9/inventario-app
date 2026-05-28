-- Add ON DELETE CASCADE so deleting a fund also removes its transactions
alter table cash_transactions
  drop constraint cash_transactions_fund_id_fkey,
  add constraint cash_transactions_fund_id_fkey
    foreign key (fund_id) references cash_funds(id) on delete cascade;
