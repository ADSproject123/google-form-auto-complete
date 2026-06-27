-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)

create table if not exists user_credits (
  user_id uuid references auth.users(id) on delete cascade primary key,
  balance  integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists credit_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  delta      integer not null,
  kind       text not null check (kind in ('purchase','form_fill','pdf_convert','youtube_dl','refund')),
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists credit_transactions_user_created
  on credit_transactions (user_id, created_at desc);

-- RLS
alter table user_credits       enable row level security;
alter table credit_transactions enable row level security;

create policy "users read own credits"
  on user_credits for select using (auth.uid() = user_id);

create policy "users read own transactions"
  on credit_transactions for select using (auth.uid() = user_id);

-- Atomic spend (called by authenticated users via supabase.rpc)
create or replace function spend_credits(p_amount integer, p_kind text, p_note text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_balance integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update user_credits
  set balance    = balance - p_amount,
      updated_at = now()
  where user_id = v_uid
    and balance >= p_amount
  returning balance into v_balance;

  if not found then
    return json_build_object('ok', false, 'error', 'insufficient_credits');
  end if;

  insert into credit_transactions (user_id, delta, kind, note)
  values (v_uid, -p_amount, p_kind, p_note);

  return json_build_object('ok', true, 'balance', v_balance);
end;
$$;

-- Add credits (called server-side with service role after confirmed payment)
create or replace function add_credits_for_user(p_user_id uuid, p_amount integer, p_kind text, p_note text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  insert into user_credits (user_id, balance)
  values (p_user_id, p_amount)
  on conflict (user_id) do update
  set balance    = user_credits.balance + p_amount,
      updated_at = now()
  returning balance into v_balance;

  insert into credit_transactions (user_id, delta, kind, note)
  values (p_user_id, p_amount, p_kind, p_note);

  return v_balance;
end;
$$;
