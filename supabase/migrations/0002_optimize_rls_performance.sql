-- ============================================================================
-- call-tracker: RLS(行レベルセキュリティ)の高速化
--
-- 背景：
--   リードを15,000件以上取り込んだところ、リード一覧の読み込みで
--   「canceling statement due to statement timeout」というエラーが出るようになった。
--
-- 原因：
--   これまでの can_view_lead() は「管理者かどうか」の判定を、
--   leads テーブルの行1件ごとに毎回計算し直していた。
--   件数が少ないうちは気づかないが、1万件を超えるとこの積み重ねで
--   データベースへの負荷が大きくなり、タイムアウトしてしまっていた。
--
-- 対応：
--   「自分は管理者かどうか」をクエリの最初に1回だけ判定し、
--   管理者であればそれ以降は行ごとの判定を省略するように変更。
--   （Supabase公式が推奨している書き方に合わせている）
--   あわせて、チームリーダーの部下検索を高速化するための索引も追加。
-- ============================================================================

-- 部下の検索（team_lead_id での絞り込み）を高速化する索引
create index if not exists profiles_team_lead_id_idx on public.profiles(team_lead_id);

-- 一覧の並び替え（登録日時の新しい順）を高速化する索引
create index if not exists leads_created_at_idx on public.leads(created_at desc);

-- ----------------------------------------------------------------------------
-- ヘルパー関数の再定義
--   ・profiles テーブルは「ログイン済みなら誰でも閲覧可」のポリシーが
--     すでにあるため security definer は不要（かえって余分な処理が増える）
--   ・auth.uid() を (select auth.uid()) と書くことで、
--     Postgres が「クエリ全体で1回だけ計算すればよい値」と認識できるようにする
-- ----------------------------------------------------------------------------
create or replace function public.current_role() returns text
language sql stable set search_path = public as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.current_is_owner() returns boolean
language sql stable set search_path = public as $$
  select coalesce((select is_owner from public.profiles where id = (select auth.uid())), false);
$$;

create or replace function public.can_view_lead(p_assigned_to uuid) returns boolean
language sql stable set search_path = public as $$
  select case
    when (select public.current_role()) = 'admin' then true
    when (select public.current_role()) = 'teamlead' then
      p_assigned_to = (select auth.uid())
      or p_assigned_to in (select id from public.profiles where team_lead_id = (select auth.uid()))
    else p_assigned_to = (select auth.uid())
  end;
$$;

create or replace function public.can_edit_lead(p_assigned_to uuid) returns boolean
language sql stable set search_path = public as $$
  select public.can_view_lead(p_assigned_to);
$$;

-- ----------------------------------------------------------------------------
-- ポリシーの再作成
--   「(select current_role()) = 'admin' の場合は無条件でtrue」を先頭に置くことで、
--   管理者・オーナーがアクセスするときは行ごとの判定処理そのものを省略できる。
-- ----------------------------------------------------------------------------
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select
  using (
    (select public.current_role()) = 'admin'
    or public.can_view_lead(assigned_to)
  );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert
  with check (
    (select public.current_role()) = 'admin'
    or public.can_view_lead(assigned_to)
  );

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update
  using (
    (select public.current_role()) = 'admin'
    or public.can_view_lead(assigned_to)
  )
  with check (
    (select public.current_role()) = 'admin'
    or public.can_view_lead(assigned_to)
  );

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete
  using ((select public.current_role()) = 'admin');

drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select
  using (
    (select public.current_role()) = 'admin'
    or exists (select 1 from public.leads l where l.id = lead_id and public.can_view_lead(l.assigned_to))
  );

drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls for insert
  with check (
    (select public.current_role()) = 'admin'
    or exists (select 1 from public.leads l where l.id = lead_id and public.can_view_lead(l.assigned_to))
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (
    (select auth.uid()) = id
    or (select public.current_is_owner())
    or ((select public.current_role()) = 'admin' and role in ('teamlead','staff','guest') and coalesce(is_owner,false) = false)
  )
  with check (
    (select auth.uid()) = id
    or (select public.current_is_owner())
    or ((select public.current_role()) = 'admin' and role in ('teamlead','staff','guest') and coalesce(is_owner,false) = false)
  );

drop policy if exists field_defs_write on public.field_defs;
create policy field_defs_write on public.field_defs for all
  using ((select public.current_role()) = 'admin')
  with check ((select public.current_role()) = 'admin');
