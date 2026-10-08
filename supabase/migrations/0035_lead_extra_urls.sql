-- ============================================================================
-- call-tracker: リードに「追加のURL」を持てるようにする
--   ホームページを複数持っている会社向け。メインのURL（leads.url）はそのままで、
--   2つ目以降のURLを extra_urls（文字列の配列）に任意で追加できる。
-- ============================================================================
alter table public.leads
  add column if not exists extra_urls jsonb not null default '[]'::jsonb;

comment on column public.leads.extra_urls is
  '2つ目以降のホームページURL（文字列の配列）。メインのURLは url 列。';
