-- Run this in your Supabase SQL editor after 001_credits.sql

create table if not exists pending_credit_orders (
  id           uuid primary key,
  intent_id    text not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  credits_to_add integer not null,
  package_id   text not null,
  paid         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists pending_credit_orders_intent
  on pending_credit_orders (intent_id);

alter table pending_credit_orders enable row level security;
-- All access via service role only (bypasses RLS)
