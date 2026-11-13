create table if not exists public.admin_settings (
  id text primary key,
  pin_hash text not null,
  pin_salt text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;
