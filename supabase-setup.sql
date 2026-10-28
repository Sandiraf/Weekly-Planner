-- Jalankan sekali di Supabase Dashboard > SQL Editor.
create table if not exists public.planner_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.planner_data enable row level security;
revoke all on table public.planner_data from anon, authenticated;
grant select, insert, update, delete on table public.planner_data to authenticated;

drop policy if exists "Planner owners can read their data" on public.planner_data;
create policy "Planner owners can read their data"
  on public.planner_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Planner owners can create their data" on public.planner_data;
create policy "Planner owners can create their data"
  on public.planner_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Planner owners can update their data" on public.planner_data;
create policy "Planner owners can update their data"
  on public.planner_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Planner owners can delete their data" on public.planner_data;
create policy "Planner owners can delete their data"
  on public.planner_data for delete to authenticated
  using ((select auth.uid()) = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planner_data'
  ) then
    alter publication supabase_realtime add table public.planner_data;
  end if;
end
$$;
