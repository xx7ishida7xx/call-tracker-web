-- ============================================================================
-- call-tracker: 電話番号の区切りがそろった後に、同じ会社が二重に登録されているものを整理する
--
-- 0021で電話番号の表記をそろえたあと、「電話番号の数字が同じ」かつ「会社名が全く同じ」
-- リードが2件以上ある場合に、新しい方（あとから登録された方）を削除する。
-- ただし、次の場合は削除しない（＝人が確認して判断する）：
--   ・新しい方に、通話記録（架電履歴）が1件でもある
--   ・会社名が違う（同じ電話番号でも別の会社の可能性があるため）
-- 先に、下の「確認用SELECT」を単独で実行して、削除される予定の行を確認できる。
-- ============================================================================

-- ■確認用SELECT（削除される予定の行を一覧で見るだけで、何も変更しない）
-- select l.id, l.company, l.phone, l.created_at
-- from public.leads l
-- where exists (
--   select 1 from public.leads o
--   where o.id <> l.id
--     and regexp_replace(o.phone, '\D', '', 'g') = regexp_replace(l.phone, '\D', '', 'g')
--     and o.company = l.company
--     and (o.created_at < l.created_at or (o.created_at = l.created_at and o.id < l.id))
-- )
-- and not exists (select 1 from public.calls c where c.lead_id = l.id);

delete from public.leads l
where regexp_replace(l.phone, '\D', '', 'g') <> ''
  and exists (
    select 1 from public.leads o
    where o.id <> l.id
      and regexp_replace(o.phone, '\D', '', 'g') = regexp_replace(l.phone, '\D', '', 'g')
      and o.company = l.company
      and (o.created_at < l.created_at or (o.created_at = l.created_at and o.id < l.id))
  )
  and not exists (select 1 from public.calls c where c.lead_id = l.id);
