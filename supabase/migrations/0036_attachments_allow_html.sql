-- ============================================================================
-- call-tracker: リードの添付ファイルに HTML（診断レポートなど）を使えるようにする
--   保存先バケット lead-attachments の許可ファイル形式に text/html を追加する。
--   HTMLは、サイト内で直接表示せず、ダウンロードして開く形にする（アプリ側で
--   署名付きURLにダウンロード指定を付ける）ので、コールトラッカー上でHTMLのプログラムが動くことはない。
-- ============================================================================
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(coalesce(allowed_mime_types, array[]::text[]) || array['text/html']) as m
)
where id = 'lead-attachments';
