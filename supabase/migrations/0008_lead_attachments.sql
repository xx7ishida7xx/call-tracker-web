-- ============================================================================
-- call-tracker: リードへのファイル添付機能
--   ・診断レポート／アポ表など、リードに紐づくファイルを保存・履歴として一覧できる
--   ・実ファイルは Supabase Storage の専用バケット「lead-attachments」に保存し、
--     このテーブルにはファイルのメタ情報（保存パス・元のファイル名・区分など）だけを持つ
--   ・閲覧・アップロードは、そのリードを閲覧できる人（can_view_lead）なら誰でも可能
--   ・削除は、アップロード本人か管理者のみ
-- ============================================================================

create table public.lead_attachments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  category text not null check (category in ('診断レポート', 'アポ表')),
  file_path text not null,       -- Storage内の保存パス（lead_id/ランダムID-ファイル名）
  file_name text not null,       -- 元のファイル名（表示・ダウンロード用）
  file_size bigint not null default 0,
  mime_type text not null default '',
  note text not null default '', -- 任意メモ
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.lead_attachments is 'リードに添付するファイル（診断レポート・アポ表など）のメタ情報。実ファイルはStorageのlead-attachmentsバケットに保存。';

create index lead_attachments_lead_id_idx on public.lead_attachments(lead_id, category, created_at desc);

alter table public.lead_attachments enable row level security;

create policy lead_attachments_select on public.lead_attachments for select
  using (
    (select public.current_role()) = 'admin'
    or exists (select 1 from public.leads l where l.id = lead_id and public.can_view_lead(l.assigned_to))
  );

create policy lead_attachments_insert on public.lead_attachments for insert
  with check (
    (select public.current_role()) = 'admin'
    or exists (select 1 from public.leads l where l.id = lead_id and public.can_view_lead(l.assigned_to))
  );

-- 削除は、アップロード本人か管理者のみ（他の担当者のアップロードを誤って消せないように）
create policy lead_attachments_delete on public.lead_attachments for delete
  using (
    (select public.current_role()) = 'admin'
    or uploaded_by = (select auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Storage バケット（非公開。ダウンロードは署名付きURL経由のみ）
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-attachments',
  'lead-attachments',
  false,
  26214400, -- 25MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
on conflict (id) do nothing;

-- storage.objects は Supabase のプロジェクト作成時点でRLSが有効になっているが、
-- 念のためここでも明示しておく（すでに有効な場合は何も起こらない）
alter table storage.objects enable row level security;

-- Storage内のパスは「<lead_id>/<ランダムID>-<ファイル名>」という形式で保存する。
-- storage.foldername(name) はパスをスラッシュで区切った配列を返すので、
-- 先頭の要素（(storage.foldername(name))[1]）がそのファイルの lead_id にあたる。
-- これを public.leads と突き合わせて can_view_lead で権限チェックする。
create policy lead_attachments_storage_select on storage.objects for select
  using (
    bucket_id = 'lead-attachments'
    and (
      (select public.current_role()) = 'admin'
      or exists (
        select 1 from public.leads l
        where l.id = ((storage.foldername(name))[1])::uuid
          and public.can_view_lead(l.assigned_to)
      )
    )
  );

create policy lead_attachments_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'lead-attachments'
    and (
      (select public.current_role()) = 'admin'
      or exists (
        select 1 from public.leads l
        where l.id = ((storage.foldername(name))[1])::uuid
          and public.can_view_lead(l.assigned_to)
      )
    )
  );

-- Storage側の削除も、テーブル側と同じく「アップロード本人か管理者のみ」に揃える
-- （Storageは owner 列に、アップロードした人の auth.uid() が自動で入る）
create policy lead_attachments_storage_delete on storage.objects for delete
  using (
    bucket_id = 'lead-attachments'
    and (
      (select public.current_role()) = 'admin'
      or owner = (select auth.uid())
    )
  );
