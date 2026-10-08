-- 【削除用】0027（確認用）で件数を確認してから実行してください。
-- 直近1日以内に重複して追加された「架電履歴なし・未着手」のリードだけを削除します。
-- （古い側＝元からあったリードと、その架電履歴・HPの状態は残ります）
delete from public.leads l
where l.created_at >= now() - interval '1 day'
  and l.status = '未着手'
  and not exists (select 1 from public.calls c where c.lead_id = l.id)
  and exists (
    select 1 from public.leads e
    where e.phone = l.phone and e.id <> l.id and e.created_at < l.created_at
  );
