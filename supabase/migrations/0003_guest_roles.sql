-- ============================================================================
-- call-tracker: ゲストロールの細分化 + 会社名表示 + 自己権限昇格の防止
--
-- 変更内容：
--   1. 「guest」ロールを「guest_admin（ゲスト管理者）」「guest_member（ゲストメンバー）」の
--      2つに分割。ゲスト管理者は、チームリーダーと同じように「自分のチーム（配下の
--      ゲストメンバー）」のリードだけ担当者を割り振れるようになる。
--   2. profiles に org_name（会社名）列を追加。販売店（ゲストの取引先）が決まったら、
--      メンバー管理画面からその会社名を設定できるようにする。
--   3. （安全対策）これまで、自分自身のプロフィール行は誰でも更新できる仕組みだった
--      ため、理論上は本人が自分の role や is_owner を書き換えることも可能だった。
--      外部の取引先（ゲスト）を招待するようになったタイミングで、念のため
--      「role / is_owner の変更は管理者・オーナーのみ」を強制するトリガーを追加する。
-- ============================================================================

-- 既存の 'guest' ロールを 'guest_member' に一旦寄せる（あとで個別に「ゲスト管理者」へ変更可能）
update public.profiles set role = 'guest_member' where role = 'guest';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','teamlead','staff','guest_admin','guest_member'));

alter table public.profiles add column if not exists org_name text;
comment on column public.profiles.org_name is '販売店（取引先）が決まったゲストチームに設定する会社名。ゲスト管理者・ゲストメンバーに対して使用。';

-- ----------------------------------------------------------------------------
-- can_view_lead / can_edit_lead：ゲスト管理者を、チームリーダーと同じ「自分のチームまで見える」
-- 扱いに変更する（team_lead_id は teamlead/guest_admin どちらのチーム編成にも共用で使う）
-- ----------------------------------------------------------------------------
create or replace function public.can_view_lead(p_assigned_to uuid) returns boolean
language sql stable set search_path = public as $$
  select case
    when (select public.current_role()) = 'admin' then true
    when (select public.current_role()) in ('teamlead','guest_admin') then
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
-- profiles_update ポリシー：管理者が変更可能なロールの一覧に guest_admin / guest_member を追加
-- ----------------------------------------------------------------------------
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (
    (select auth.uid()) = id
    or (select public.current_is_owner())
    or ((select public.current_role()) = 'admin' and role in ('teamlead','staff','guest_admin','guest_member') and coalesce(is_owner,false) = false)
  )
  with check (
    (select auth.uid()) = id
    or (select public.current_is_owner())
    or ((select public.current_role()) = 'admin' and role in ('teamlead','staff','guest_admin','guest_member') and coalesce(is_owner,false) = false)
  );

-- ----------------------------------------------------------------------------
-- 安全対策：role / is_owner の変更は、管理者・オーナー（またはサーバー側の管理者操作）
-- からのみ許可する。本人による自己更新であっても、この2列だけは対象外にする。
-- ----------------------------------------------------------------------------
create or replace function public.prevent_self_privilege_escalation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- サーバーの管理者用クライアント（招待機能など）からの変更は常に許可
  if auth.role() = 'service_role' then
    return new;
  end if;

  if (new.role is distinct from old.role) or (new.is_owner is distinct from old.is_owner) then
    if not (
      public.current_is_owner()
      or (
        public.current_role() = 'admin'
        and new.role in ('teamlead','staff','guest_admin','guest_member')
        and coalesce(new.is_owner, false) = false
      )
    ) then
      raise exception 'ロール・オーナー権限は管理者のみが変更できます。';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privilege on public.profiles;
create trigger profiles_guard_privilege
  before update on public.profiles
  for each row execute function public.prevent_self_privilege_escalation();
