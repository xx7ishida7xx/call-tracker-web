-- ============================================================================
-- call-tracker: リード一覧の新しい検索項目のためのフィールド追加
--   ・信販会社（割賦契約の場合の信販会社名。自由入力）
--   ・集客意欲（有／無。未設定は空文字）
-- ============================================================================

alter table public.leads
  add column if not exists credit_company text not null default '',
  add column if not exists acquisition_desire text not null default '';

comment on column public.leads.credit_company is '信販会社（割賦契約の場合の信販会社名）';
comment on column public.leads.acquisition_desire is '集客意欲（"有" / "無" / 未設定は空文字）';
