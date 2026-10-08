-- 【確認用・何も変更しません】
-- 2026-10-08 の「A社 制作推定あり 1,919件」の取り込みで、すでに登録済みの電話番号まで
-- 重複して追加されてしまった分を探します。
-- 条件：同じ電話番号の「より古いリード」が別にあり、自分は直近1日以内に作られ、
--       まだ架電履歴が1件もなく、ステータスが「未着手」のもの。
select count(*) as 重複して追加されたリード数
from public.leads l
where l.created_at >= now() - interval '1 day'
  and l.status = '未着手'
  and not exists (select 1 from public.calls c where c.lead_id = l.id)
  and exists (
    select 1 from public.leads e
    where e.phone = l.phone and e.id <> l.id and e.created_at < l.created_at
  );

-- 中身の一部（20件）
select l.company, l.phone, l.url, l.hp_status, l.created_at
from public.leads l
where l.created_at >= now() - interval '1 day'
  and l.status = '未着手'
  and not exists (select 1 from public.calls c where c.lead_id = l.id)
  and exists (
    select 1 from public.leads e
    where e.phone = l.phone and e.id <> l.id and e.created_at < l.created_at
  )
order by l.created_at
limit 20;
