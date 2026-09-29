-- ============================================================================
-- call-tracker: コール結果taxonomyの抜本的見直し（Round 2 / Item 4）
--
-- 背景：
--   通話結果を「つながらなかった／つながった／その他／訪問結果」の4グループに
--   分類し、結果を選ぶと「有効架電」「アポ獲得」「ステータス」が自動で連動する
--   仕様に変更した（アプリ側は lib/types.ts の CALL_RESULT_OUTCOME で管理）。
--   あわせて、通話ごとの見込み度ランク（A〜D）と「激アツ!!」フラグを記録できる
--   ようにする。
--
--   「つながらなかった」グループの再コールと「つながった」グループの再コールは、
--   表示上はどちらも「再コール」のままだが、意味合いが異なるため、どちらの
--   グループで選ばれたかを result_group 列に記録して区別する。
-- ============================================================================

alter table public.calls
  add column if not exists result_group text,
  add column if not exists rank text,
  add column if not exists hot boolean not null default false;

comment on column public.calls.result_group is
  '結果を選んだ際のグループ（つながらなかった／つながった／その他／訪問結果）。既存データはnull。';
comment on column public.calls.rank is
  '通話ごとの見込み度ランク（A/B/C/D）。未選択はnull。';
comment on column public.calls.hot is
  '「激アツ!!」フラグ。';
