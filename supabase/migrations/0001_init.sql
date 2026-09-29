-- ============================================================================
-- call-tracker: initial schema
-- users(profiles) / leads / calls / field_defs + Row Level Security
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles (auth.users を拡張する形の「会社の名簿」テーブル)
--   role: admin(管理者) / teamlead(チームリーダー) / staff(スタッフ) / guest(ゲスト)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',            -- 登録時の本来の名前
  display_name text,                        -- オーナー/管理者が上書きできる表示名
  role text not null default 'staff' check (role in ('admin','teamlead','staff','guest')),
  is_owner boolean not null default false,  -- オーナー(1名想定)
  team_lead_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'スタッフ名簿。auth.users を1:1で拡張する。';

-- ----------------------------------------------------------------------------
-- field_defs (リードのカスタム項目定義)
-- ----------------------------------------------------------------------------
create table public.field_defs (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- leads (見込み客/リード本体)
-- ----------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company text not null default '',
  pref text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  url text not null default '',
  cms text not null default '',
  genre text not null default '',
  subgenre text not null default '',
  status text not null default '未着手',
  assigned_to uuid references public.profiles(id) on delete set null,
  last_call_at timestamptz,
  last_call_staff text,
  recall_at timestamptz,
  recall_target text,
  rep_name text,
  rep_mobile text,
  contact_name text,
  contact_mobile text,
  contracts jsonb not null default '[]'::jsonb,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create extension if not exists pg_trgm;

create index leads_assigned_to_idx on public.leads(assigned_to);
create index leads_status_idx on public.leads(status);
create index leads_company_trgm_idx on public.leads using gin (company gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- calls (架電履歴)
-- ----------------------------------------------------------------------------
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  caller_id uuid references public.profiles(id) on delete set null,
  called_at timestamptz not null default now(),
  result text not null default '',
  recall_at timestamptz,
  recall_target text,
  appointment boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index calls_lead_id_idx on public.calls(lead_id);
create index calls_called_at_idx on public.calls(called_at desc);

-- ----------------------------------------------------------------------------
-- updated_at 自動更新
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 新規サインアップ時に profiles を自動作成
--   ※最初の1人をオーナーにする作業は、デプロイ手順書の通り後で手動で行う
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- ヘルパー関数（RLSで使う）
-- ----------------------------------------------------------------------------
create or replace function public.current_role() returns text
language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_is_owner() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_owner from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_view_lead(p_assigned_to uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select case
    when public.current_role() = 'admin' then true
    when public.current_role() = 'teamlead' then
      p_assigned_to = auth.uid()
      or p_assigned_to in (select id from public.profiles where team_lead_id = auth.uid())
    else p_assigned_to = auth.uid()
  end;
$$;

create or replace function public.can_edit_lead(p_assigned_to uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select public.can_view_lead(p_assigned_to);
$$;

-- ----------------------------------------------------------------------------
-- RLS 有効化
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.calls enable row level security;
alter table public.field_defs enable row level security;

-- profiles: ログイン済みなら全員分を閲覧可（担当者選択に必要）
create policy profiles_select_all on public.profiles for select
  using (auth.role() = 'authenticated');

-- profiles: 本人 / オーナー / (管理者は自分より下位ロールのみ) が更新可
create policy profiles_update on public.profiles for update
  using (
    auth.uid() = id
    or public.current_is_owner()
    or (public.current_role() = 'admin' and role in ('teamlead','staff','guest') and coalesce(is_owner,false) = false)
  )
  with check (
    auth.uid() = id
    or public.current_is_owner()
    or (public.current_role() = 'admin' and role in ('teamlead','staff','guest') and coalesce(is_owner,false) = false)
  );

-- leads: 閲覧可能な範囲のみ select / insert / update
create policy leads_select on public.leads for select
  using (public.can_view_lead(assigned_to));

create policy leads_insert on public.leads for insert
  with check (public.can_view_lead(assigned_to));

create policy leads_update on public.leads for update
  using (public.can_view_lead(assigned_to))
  with check (public.can_view_lead(assigned_to));

create policy leads_delete on public.leads for delete
  using (public.current_role() = 'admin');

-- calls: 紐づくリードが見える人だけ select / insert
create policy calls_select on public.calls for select
  using (exists (select 1 from public.leads l where l.id = lead_id and public.can_view_lead(l.assigned_to)));

create policy calls_insert on public.calls for insert
  with check (exists (select 1 from public.leads l where l.id = lead_id and public.can_view_lead(l.assigned_to)));

-- field_defs: 閲覧は全員、書き込みは管理者のみ
create policy field_defs_select on public.field_defs for select
  using (auth.role() = 'authenticated');

create policy field_defs_write on public.field_defs for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');
