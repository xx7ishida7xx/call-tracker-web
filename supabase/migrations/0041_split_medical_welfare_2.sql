-- 0040で残った「医療・福祉」を、言葉を足して、さらに振り分ける。
-- 業種詳細が空・「医療・福祉」だけ・「会社名・住所…」のものは、会社名を手がかりにする。
-- 動物病院・ペット系は触らない。判断できないものは「医療・福祉」のまま残す。

with t as (
  select id,
    case
      when coalesce(subgenre,'') = '' or subgenre ~ '^医療.福祉$' or subgenre ~ '^会社名'
        then coalesce(company,'')
      else subgenre
    end as s
  from leads
  where genre = '医療・福祉'
),
c as (
  select id,
    case
      when s ~* '(動物|ペット|獣医|どうぶつ|アニマル)' then null
      when s ~* '(介護|福祉|デイサービス|老人|児童|就労|放課後|ケアマネ|ヘルパー|保育|子育て|里親|グループホーム|ケアプラザ|母子|障害|学童)'
           and s !~* '(医療|医院|クリニック|病院|診療|歯科)' then '福祉'
      when s ~* '(クリニック|医院|歯科|歯医者|病院|診療|薬局|医療|整骨|整体|接骨|鍼灸|カイロ|治療|リハビリ|眼科|小児科|外科|皮膚科|内科|耳鼻|咽喉|看護|マッサージ|柔道整復|漢方|義肢|義足|アイバンク|角膜|臨床試験|clinic|dental|seikotsu|sekkotsu|shinkyu|med)'
           and s !~* '(福祉|介護|デイサービス|老人|保育)' then '医療'
      else null
    end as g
  from t
)
update leads l set genre = c.g
from c
where l.id = c.id and c.g is not null;

select genre, count(*) as 件数
from leads
where genre in ('医療','福祉','医療・福祉')
group by genre
order by 件数 desc;
