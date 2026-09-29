-- ============================================================================
-- call-tracker: 「アポ禁」ステータスの追加 + 閲覧制限
--
-- 背景：
--   リードのステータスに「アポ禁」（今後連絡してはいけない先）を追加したい。
--   status 列はもともと自由記述の text 型なので、値自体はアプリ側
--   （lib/types.ts の LEAD_STATUSES）に追加するだけで使えるようになるが、
--   あわせて「アポ禁」になったリードを、オーナー・管理者以外の目に
--   一切触れさせないようにするため、閲覧・更新に関するRLSを変更する。
--
-- 方針：
--   ・オーナー・管理者（current_role() = 'admin'。オーナーの role も
--     'admin' で登録されているため、同じ条件でカバーされる）はこれまで通り
--     全件を閲覧・編集できる。
--   ・それ以外のロール（チームリーダー・スタッフ・ゲスト管理者・
--     ゲストメンバー）は、ステータスが「アポ禁」のリードを一覧にも
--     詳細にも表示せず、URLを直接開いても見られないようにする（存在しない
--     ものとして扱われる）。あわせて、そのリードに紐づく通話履歴も
--     見えなくなる。
--   ・通話記録の画面からステータスを「アポ禁」に変更する操作自体は、
--     誰でもできるようにする（電話口で「二度とかけてくるな」と言われた
--     スタッフが、その場で記録できるようにするため）。ただし、一度
--     「アポ禁」になったリードは、オーナー・管理者以外はその後
--     編集・再表示ができなくなる。
-- ============================================================================

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select
  using (
    (select public.current_role()) = 'admin'
    or (public.can_view_lead(assigned_to) and status <> 'アポ禁')
  );

-- update: 「今の行を編集してよいか」(using) は今まで通り可視範囲＋アポ禁でない事を要求するが、
-- 「更新後の行」(with check) は status を条件に含めない。これにより、可視範囲内のリードを
-- 「アポ禁」へ変更する操作そのものは誰でも行える（＝アポ禁への変更は許可しつつ、
-- 変更後は leads_select 側で見えなくなる）。
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update
  using (
    (select public.current_role()) = 'admin'
    or (public.can_view_lead(assigned_to) and status <> 'アポ禁')
  )
  with check (
    (select public.current_role()) = 'admin'
    or public.can_view_lead(assigned_to)
  );

drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select
  using (
    (select public.current_role()) = 'admin'
    or exists (
      select 1 from public.leads l
      where l.id = lead_id
        and public.can_view_lead(l.assigned_to)
        and l.status <> 'アポ禁'
    )
  );

drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls for insert
  with check (
    (select public.current_role()) = 'admin'
    or exists (
      select 1 from public.leads l
      where l.id = lead_id
        and public.can_view_lead(l.assigned_to)
        and l.status <> 'アポ禁'
    )
  );
