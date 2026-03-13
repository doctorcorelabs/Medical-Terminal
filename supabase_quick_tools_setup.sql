-- Per-user Quick Tools persistence for dashboard shortcuts
-- Run this SQL in Supabase SQL Editor.

create table if not exists public.user_quick_tools (
    user_id uuid primary key references auth.users(id) on delete cascade,
    tool_ids jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.user_quick_tools enable row level security;

-- Allow users to read only their own quick-tools row
drop policy if exists "user_quick_tools_select_own" on public.user_quick_tools;
create policy "user_quick_tools_select_own"
on public.user_quick_tools
for select
using (auth.uid() = user_id);

-- Allow users to insert only their own row
drop policy if exists "user_quick_tools_insert_own" on public.user_quick_tools;
create policy "user_quick_tools_insert_own"
on public.user_quick_tools
for insert
with check (auth.uid() = user_id);

-- Allow users to update only their own row
drop policy if exists "user_quick_tools_update_own" on public.user_quick_tools;
create policy "user_quick_tools_update_own"
on public.user_quick_tools
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Optional: allow users to delete only their own row
drop policy if exists "user_quick_tools_delete_own" on public.user_quick_tools;
create policy "user_quick_tools_delete_own"
on public.user_quick_tools
for delete
using (auth.uid() = user_id);

-- Helpful index for update order if needed later
create index if not exists idx_user_quick_tools_updated_at on public.user_quick_tools (updated_at desc);
