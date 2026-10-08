-- ============================================================================
-- call-tracker: 前確（ぜんかく）の流れの整理 ＋ リードのコメント（チャット）機能
--
-- 1) ステータス「アポ獲得」を「アポ確定」に名前変更（通話結果「アポ成立」も「アポ確定」に）
--      村形さんが前確依頼 → ステータス「前確待ち」
--      橋本さんが前確して、通話記録の結果で「アポ確定」か「前確NG」を選ぶ
--      「前確OK」というステータスは作らない
-- 2) アポの成績を付ける人（calls.appointment_credit_to）を追加
--      前確待ちからのアポ確定は、前確依頼をした人（村形さん）の成績になる。
--      架電数・有効架電は、電話した本人（橋本さん）のまま。担当者（leads.assigned_to）は変えない。
-- 3) リードのコメント（lead_comments）を追加
--      宛先（任意）を選べる。宛先にされた人には、未読の目印が出る（read_at が空＝未読）
-- ============================================================================

-- ---------- 1) 名前の変更 ----------
update public.leads set status = 'アポ確定' where status = 'アポ獲得';
update public.calls set status_before = 'アポ確定' where status_before = 'アポ獲得';
update public.calls set status_after = 'アポ確定' where status_after = 'アポ獲得';
update public.calls set result = 'アポ確定' where result = 'アポ成立';

-- ---------- 2) アポの成績を付ける人 ----------
alter table public.calls
  add column if not exists appointment_credit_to uuid references public.profiles(id) on delete set null;

comment on column public.calls.appointment_credit_to is
  'この通話のアポ件数の成績が付く人。通常は通話した本人。前確待ちからのアポ確定では、前確依頼をした人。';

-- これまでの通話は、すべて通話した本人の成績のまま
update public.calls set appointment_credit_to = caller_id where appointment_credit_to is null;

-- 今後の通話も、指定がなければ通話した本人の成績にする（アプリ側の入れ忘れ対策）
create or replace function public.calls_default_appointment_credit() returns trigger
language plpgsql as $$
begin
  if new.appointment_credit_to is null then
    new.appointment_credit_to := new.caller_id;
  end if;
  return new;
end;
$$;

drop trigger if exists calls_default_appointment_credit on public.calls;
create trigger calls_default_appointment_credit
  before insert on public.calls
  for each row execute function public.calls_default_appointment_credit();

create index if not exists calls_appointment_credit_idx
  on public.calls(appointment_credit_to, called_at)
  where appointment = true;

-- ---------- 3) リードのコメント ----------
create table if not exists public.lead_comments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  to_profile_id uuid references public.profiles(id) on delete set null, -- 宛先（空＝全体へのコメント）
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz                                                   -- 宛先の人が読んだ日時（空＝未読）
);

comment on table public.lead_comments is 'リードごとのコメント（チャット）。宛先を指定すると、宛先の人に未読の目印が出る。';

create index if not exists lead_comments_lead_idx on public.lead_comments(lead_id, created_at);
create index if not exists lead_comments_unread_idx
  on public.lead_comments(to_profile_id) where read_at is null;

alter table public.lead_comments enable row level security;

-- コメントは社内のメンバー用（ゲスト＝販売店のアカウントには見せない）。
-- 社内メンバーは、そのリードを見られる（leads の閲覧ルールに従う）なら、コメントも読める・書ける
drop policy if exists lead_comments_select on public.lead_comments;
create policy lead_comments_select on public.lead_comments for select
  using (
    ((select public.current_role()) in ('admin', 'teamlead', 'staff') or public.current_is_owner())
    and exists (select 1 from public.leads l where l.id = lead_id)
  );

drop policy if exists lead_comments_insert on public.lead_comments;
create policy lead_comments_insert on public.lead_comments for insert
  with check (
    author_id = (select auth.uid())
    and ((select public.current_role()) in ('admin', 'teamlead', 'staff') or public.current_is_owner())
    and exists (select 1 from public.leads l where l.id = lead_id)
  );

-- 宛先の本人だけが、既読にできる（更新できる列は read_at だけ）
drop policy if exists lead_comments_mark_read on public.lead_comments;
create policy lead_comments_mark_read on public.lead_comments for update
  using (to_profile_id = (select auth.uid()))
  with check (to_profile_id = (select auth.uid()));

revoke update on public.lead_comments from authenticated;
grant update (read_at) on public.lead_comments to authenticated;

-- 削除は、書いた本人か管理者のみ
drop policy if exists lead_comments_delete on public.lead_comments;
create policy lead_comments_delete on public.lead_comments for delete
  using (
    (select public.current_role()) = 'admin'
    or public.current_is_owner()
    or author_id = (select auth.uid())
  );
