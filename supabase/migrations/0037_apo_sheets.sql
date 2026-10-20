-- ============================================================================
-- call-tracker: アポ表（アポイント情報シート）をアプリ内で作成・保存できるようにする
--   ・メニューの「アポ表」ページで、リードを選んで入力 → 保存 → Excelでダウンロード、
--     またはリードの添付（区分：アポ表）に登録できる。
--   ・入力内容は data 列（jsonb）にまとめて保存する（項目の増減に強くするため）。
--   ・閲覧：管理者／作成者本人／そのリードを閲覧できる人
--     作成：自分が作成者として、閲覧できるリードに対してのみ
--     更新・削除：作成者本人か管理者のみ
-- ============================================================================

create table if not exists public.apo_sheets (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.apo_sheets is 'アポ表（アポイント情報シート）。入力内容はdata(jsonb)に保存。';

create index if not exists apo_sheets_lead_id_idx on public.apo_sheets(lead_id, created_at desc);
create index if not exists apo_sheets_created_by_idx on public.apo_sheets(created_by, created_at desc);

alter table public.apo_sheets enable row level security;

create policy apo_sheets_select on public.apo_sheets for select
  using (
    (select public.current_role()) = 'admin'
    or created_by = (select auth.uid())
    or exists (select 1 from public.leads l where l.id = lead_id and public.can_view_lead(l.assigned_to))
  );

create policy apo_sheets_insert on public.apo_sheets for insert
  with check (
    created_by = (select auth.uid())
    and (
      (select public.current_role()) = 'admin'
      or exists (select 1 from public.leads l where l.id = lead_id and public.can_view_lead(l.assigned_to))
    )
  );

create policy apo_sheets_update on public.apo_sheets for update
  using ((select public.current_role()) = 'admin' or created_by = (select auth.uid()))
  with check ((select public.current_role()) = 'admin' or created_by = (select auth.uid()));

create policy apo_sheets_delete on public.apo_sheets for delete
  using ((select public.current_role()) = 'admin' or created_by = (select auth.uid()));

-- updated_at の自動更新（0001 で作成済みの共通関数を利用）
drop trigger if exists apo_sheets_set_updated_at on public.apo_sheets;
create trigger apo_sheets_set_updated_at before update on public.apo_sheets
  for each row execute function public.set_updated_at();
