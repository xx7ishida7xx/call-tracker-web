-- ============================================================================
-- call-tracker: リードに「HPの状態」を追加
--   ・古いHP(特に古い) / 古いHP(やや古い) / HP未確認 / 無料ツールのHP
--   ・リード一覧で、チェックを入れるだけで絞り込めるようにするための項目
--   ・すでに取り込み済みのリード（業種詳細の末尾に「・古HP-A」「・古HP-B」「・HPなし」が
--     付いているもの）は、自動で新しい項目へ振り分け、業種詳細は宿の種類だけに直す
--   ・何度実行しても同じ結果になる（二重に実行しても壊れない）
-- ============================================================================

alter table public.leads
  add column if not exists hp_status text not null default '';

comment on column public.leads.hp_status is
  'HPの状態（古いHP(特に古い) / 古いHP(やや古い) / HP未確認 / 無料ツールのHP / 未設定は空文字）';

-- 既存リードの振り分け（業種詳細の末尾の目印 → HPの状態）
update public.leads
   set hp_status = '古いHP(特に古い)',
       subgenre  = regexp_replace(subgenre, '・古HP-A$', '')
 where subgenre like '%・古HP-A';

update public.leads
   set hp_status = '古いHP(やや古い)',
       subgenre  = regexp_replace(subgenre, '・古HP-B$', '')
 where subgenre like '%・古HP-B';

update public.leads
   set hp_status = 'HP未確認',
       subgenre  = regexp_replace(subgenre, '・HPなし$', '')
 where subgenre like '%・HPなし';

-- 「HP未確認」のうち、無料ツール（Wix・Jimdo・ペライチ・Googleサイト等）で作ったHPを
-- 持っていた宿を「無料ツールのHP」に直し、HPのURLを入れる（URL欄が空のものだけ）
update public.leads l
   set hp_status = '無料ツールのHP',
       url = case when l.url = '' then v.url else l.url end
  from (values
    ('0429787809', 'https://azmhotel.wixsite.com/my-site/'),
    ('0488716705', 'https://fikanaguri.wixsite.com/loghouse'),
    ('0429781946', 'https://aganojuku.jimdofree.com/%E3%82%B2%E3%82%B9%E3%83%88%E3%83%8F%E3%82%A6%E3%82%B9%E5%90%BE%E9%87%8E%E5%AE%BF-%E3%82%AB%E3%83%95%E3%82%A7%E3%83%AC%E3%82%B9%E3%83%88%E3%83%A9%E3%83%B3/'),
    ('0429805051', 'https://hannogawara-iianbai.jimdofree.com/'),
    ('0470384351', 'https://kantaro384351.wixsite.com/kantaro'),
    ('09040730555', 'https://note.com/okayuasakiti/all'),
    ('09093945365', 'https://hidarod.wixsite.com/forestvilla'),
    ('07090066242', 'https://hatagoyasatou.wixsite.com/my-site'),
    ('0470850252', 'https://minsyukusakaya.jimdofree.com/'),
    ('0354133313', 'https://note.com/kabutos_otakipj'),
    ('09061443866', 'https://privategardencamping.wixsite.com/glamping/'),
    ('08051717465', 'https://hanjoedagaya.wixsite.com/isumigardenretreat'),
    ('08088245285', 'https://katsuurakokoro.wixstudio.com/kokoro'),
    ('0470550426', 'https://osinaya.jimdofree.com/'),
    ('0470551130', 'http://aku-aku.jimdo.com/'),
    ('09061205694', 'https://sites.google.com/view/kanayabananahouse/'),
    ('05036499467', 'https://wakatakeryokan.jimdofree.com/'),
    ('0439870442', 'https://ryokan-nomoto.jimdofree.com/'),
    ('0463952753', 'https://ogasawara-ryokan.wixsite.com/oyama'),
    ('09088747816', 'https://minshuku-cottage-svzvki.hp.peraichi.com/'),
    ('08066692332', 'https://seabreezemiura.wixsite.com/my-site'),
    ('0475242271', 'https://wgsa7132wx25.wixsite.com/takedaya'),
    ('0426872537', 'http://jinkeien.jimdofree.com/'),
    ('0426237868', 'https://tokyo8home.wixsite.com/tokyo8homejapanese'),
    ('07040296001', 'https://vanguardbackpackers.wixsite.com/website-1'),
    ('0499224966', 'http://wiseload-oshima.jimdofree.com/'),
    ('09021013840', 'https://miyajima2025.wixsite.com/senzu'),
    ('05018079707', 'https://shiamoterrace.hp.peraichi.com/'),
    ('09018448347', 'https://sites.google.com/view/toy-bricks-books/'),
    ('09049143470', 'https://arancia.hp.peraichi.com/'),
    ('0470284546', 'https://sites.google.com/view/caprihouse/'),
    ('0453215977', 'https://karakusavilla.wixsite.com/karakusavilla'),
    ('0479254300', 'https://sites.google.com/site/villacommons/'),
    ('09091050510', 'https://bicycle-minpaku-takiyama.vercel.app/index.html')
  ) as v(digits, url)
 where regexp_replace(l.phone, '\D', '', 'g') = v.digits
   and l.hp_status = 'HP未確認';
