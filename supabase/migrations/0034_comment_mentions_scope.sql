-- ============================================================================
-- call-tracker: コメントの宛先（メンション）の範囲と、ゲストもコメントを使えるようにする
--
-- 宛先に選べる人：
--   ・MAG（社内：オーナー・管理者・チームリーダー・スタッフ）のメンバー → 全メンバーを選べる
--   ・ゲスト（販売店など）のメンバー → MAGのメンバー全員と、自分と同じ会社のメンバーだけ選べる
--     （ほかのゲスト会社のメンバーは、選択肢にも出ない。サーバー側でも拒否する）
-- コメントは、そのリードを見られる人なら読める・書ける（leads の閲覧ルールに従う）。
-- ゲストは他社のプロフィールを直接は読めないため、コメントの表示名は専用の関数で取得する。
-- ============================================================================

-- 自分が宛先に選べるメンバーの一覧（名前は表示用のラベルだけ返す）
create or replace function public.mentionable_profiles()
returns table (id uuid, label text)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(p.display_name, ''), nullif(p.name, ''), '（名称未設定）') as label
  from public.profiles p
  join public.profiles me on me.id = (select auth.uid())
  where p.id <> me.id
    and (
      me.is_owner
      or me.role in ('admin', 'teamlead', 'staff')
      or p.is_owner
      or p.role in ('admin', 'teamlead', 'staff')
      or (p.org_name is not null and p.org_name = me.org_name)
    )
  order by label
$$;

-- コメントの書き手・宛先の表示名を取得する（名前のラベルだけ。メールアドレスなどは返さない）
create or replace function public.profile_display_names(p_ids uuid[])
returns table (id uuid, label text)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(p.display_name, ''), nullif(p.name, ''), '（名称未設定）') as label
  from public.profiles p
  where p.id = any (p_ids)
$$;

revoke all on function public.mentionable_profiles() from public;
revoke all on function public.profile_display_names(uuid[]) from public;
grant execute on function public.mentionable_profiles() to authenticated;
grant execute on function public.profile_display_names(uuid[]) to authenticated;

-- 読み書きの条件を作り直す（ゲストも使えるようにし、宛先は選べる範囲に限る）
drop policy if exists lead_comments_select on public.lead_comments;
create policy lead_comments_select on public.lead_comments for select
  using (exists (select 1 from public.leads l where l.id = lead_id));

drop policy if exists lead_comments_insert on public.lead_comments;
create policy lead_comments_insert on public.lead_comments for insert
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.leads l where l.id = lead_id)
    and (
      to_profile_id is null
      or exists (select 1 from public.mentionable_profiles() m where m.id = to_profile_id)
    )
  );
