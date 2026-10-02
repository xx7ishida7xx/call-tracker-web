-- ============================================================================
-- call-tracker: リードの「最終架電」情報が、削除済みの通話記録を指したまま
-- 残ってしまう不具合の修正
--
-- 背景：
--   leads テーブルの last_call_at / last_call_staff / recall_at / recall_target は、
--   通話記録（calls）を1件登録するたびに addCall（app/actions.ts）がその内容で
--   上書きしていた。しかし通話記録を削除する deleteCall（editCall も同様）は、
--   calls テーブルからその行を消すだけで、leads 側のこれらの値を再計算していなかった。
--   そのため、過去に登録した通話記録を削除すると、リード一覧の「最終架電」欄には
--   その削除済みの通話の日付が残り続け、リード詳細の「通話履歴」には何も表示されず
--   編集・削除もできない（＝そもそも記録が存在しない）という不整合が発生していた。
--   2026-10-02、ヒロさんから「GreenSnap株式会社」で実際にこの状態を報告・確認。
--
--   アプリ側のコード（app/actions.ts）は、今後は通話記録の編集・削除のたびに
--   これらの項目を自動的に再計算するよう修正済み。このSQLは、それ以前に
--   すでにズレてしまっている既存データを一度だけ修正するためのもの
--   （以後は不要。再実行しても安全＝何度流しても同じ結果になる）。
-- ============================================================================

-- ① 通話記録が1件以上残っているリード：一番新しい通話記録の内容に合わせて修正
with latest_calls as (
  select distinct on (c.lead_id)
    c.lead_id,
    c.called_at,
    c.recall_at,
    c.recall_target,
    coalesce(p.display_name, p.name, p.email) as staff_name
  from public.calls c
  left join public.profiles p on p.id = c.caller_id
  order by c.lead_id, c.called_at desc
)
update public.leads l
set
  last_call_at = lc.called_at,
  last_call_staff = lc.staff_name,
  recall_at = lc.recall_at,
  recall_target = lc.recall_target
from latest_calls lc
where l.id = lc.lead_id
  and (
    l.last_call_at is distinct from lc.called_at
    or l.last_call_staff is distinct from lc.staff_name
    or l.recall_at is distinct from lc.recall_at
    or l.recall_target is distinct from lc.recall_target
  );

-- ② 通話記録が1件も残っていないのに、最終架電などの情報だけが残っているリード：クリアする
update public.leads l
set
  last_call_at = null,
  last_call_staff = null,
  recall_at = null,
  recall_target = null
where l.last_call_at is not null
  and not exists (select 1 from public.calls c where c.lead_id = l.id);
