-- Run this script once in Supabase SQL Editor.
create table if not exists public.shop_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shop_name text not null default 'My shop',
  currency text not null default 'USD',
  phone text,
  address text,
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 120),
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 120),
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- If the original combined table was already used, preserve its existing data.
do $$
begin
  if to_regclass('public.transactions') is not null then
    insert into public.sales (id, user_id, description, category, amount, transaction_date, notes, created_at)
    select id, user_id, description, category, amount, transaction_date, notes, created_at
    from public.transactions
    where type = 'sale'
    on conflict (id) do nothing;

    insert into public.expenses (id, user_id, description, category, amount, transaction_date, notes, created_at)
    select id, user_id, description, category, amount, transaction_date, notes, created_at
    from public.transactions
    where type = 'expense'
    on conflict (id) do nothing;
  end if;
end $$;

alter table public.shop_settings enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
drop policy if exists "Users can view their own settings" on public.shop_settings;
drop policy if exists "Users can insert their own settings" on public.shop_settings;
drop policy if exists "Users can update their own settings" on public.shop_settings;
drop policy if exists "Users can view their own sales" on public.sales;
drop policy if exists "Users can insert their own sales" on public.sales;
drop policy if exists "Users can update their own sales" on public.sales;
drop policy if exists "Users can delete their own sales" on public.sales;
drop policy if exists "Users can view their own expenses" on public.expenses;
drop policy if exists "Users can insert their own expenses" on public.expenses;
drop policy if exists "Users can update their own expenses" on public.expenses;
drop policy if exists "Users can delete their own expenses" on public.expenses;
create policy "Users can view their own settings" on public.shop_settings for select using (auth.uid() = user_id);
create policy "Users can insert their own settings" on public.shop_settings for insert with check (auth.uid() = user_id);
create policy "Users can update their own settings" on public.shop_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can view their own sales" on public.sales for select using (auth.uid() = user_id);
create policy "Users can insert their own sales" on public.sales for insert with check (auth.uid() = user_id);
create policy "Users can update their own sales" on public.sales for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own sales" on public.sales for delete using (auth.uid() = user_id);
create policy "Users can view their own expenses" on public.expenses for select using (auth.uid() = user_id);
create policy "Users can insert their own expenses" on public.expenses for insert with check (auth.uid() = user_id);
create policy "Users can update their own expenses" on public.expenses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own expenses" on public.expenses for delete using (auth.uid() = user_id);
create index if not exists sales_user_date_idx on public.sales(user_id, transaction_date desc);
create index if not exists expenses_user_date_idx on public.expenses(user_id, transaction_date desc);
