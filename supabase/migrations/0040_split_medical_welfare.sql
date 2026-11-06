-- 業種「医療・福祉」を、業種詳細の言葉を手がかりに「医療」「福祉」へ振り分ける。
-- 判断できないもの（業種詳細が空・医療と福祉が両方入っている・動物病院など）は「医療・福祉」のまま残す。
-- 元に戻せるよう、振り分け前の業種を leads_genre_backup_20261106 に控える。

create table if not exists leads_genre_backup_20261106 as
  select id, genre from leads where genre = '医療・福祉';

with t as (
  select id,
    coalesce(subgenre, '') as s
  from leads
  where genre = '医療・福祉'
),
c as (
  select id,
    case
      -- 動物・ペット系は医療にも福祉にも入れない（そのまま残す）
      when s ~* '(動物|ペット|獣医)' then null
      -- 福祉：介護・福祉系の言葉があり、医療系の言葉がない
      when s ~* '(介護|福祉|デイサービス|老人|児童|就労|放課後|ケアマネ|ヘルパー)'
           and s !~* '(医療|医院|クリニック|病院|診療|歯科)' then '福祉'
      -- 医療：医療系の言葉があり、福祉・介護の言葉がない
      when s ~* '(クリニック|医院|歯科|病院|診療|薬局|医療|整骨|整体|接骨|鍼灸|カイロ|治療|リハビリ|眼科|小児科|外科|皮膚科|内科|看護|clinic|dental|seikotsu|med)'
           and s !~* '(福祉|介護|デイサービス|老人)' then '医療'
      else null
    end as g
  from t
),
u as (
  update leads l set genre = c.g
  from c
  where l.id = c.id and c.g is not null
  returning l.genre
)
select genre, count(*) as 件数 from u group by genre
union all
select '（残り：医療・福祉のまま）', count(*) from leads where genre = '医療・福祉';
