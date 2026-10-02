-- ============================================================================
-- call-tracker: ゲスト管理者が「全リード閲覧」設定（companies.can_view_all_leads）
-- をONにした状態でリード一覧を開くと、読み込みエラー
-- 「canceling statement due to statement timeout」になってしまう不具合の修正
--
-- 背景：
--   2026-10-02、株式会社I.T.Connect（ITC）のゲスト管理者 高島さんを招待し、
--   「全リード閲覧」をONにしたところ、リード一覧ページを開くと上記のタイム
--   アウトエラーになり、一覧が全く表示できない状態になった。
--
--   原因：
--   leads テーブルの閲覧・更新のRLS（行レベルセキュリティ）ポリシーは、
--   「このリードを見てよいか」を can_view_lead(assigned_to) という関数で
--   リードの行ごとに判定している。この関数の中で、ゲスト管理者・ゲスト
--   メンバーについては、自社の「全リード閲覧」フラグ
--   （current_can_view_all_leads()、companies と profiles を結合して調べる
--   関数）を確認している。
--   「全リード閲覧」がONの会社（＝1回調べれば、以後の全リードについて
--   「見てよい」と確定する）であっても、can_view_lead() が1万数千件の
--   リード行1件ごとに呼び出される実装になっていたため、行の数だけ
--   「全リード閲覧フラグを確認する処理」が繰り返され、処理全体が極端に
--   遅くなり、最終的にSupabase（Postgres）のタイムアウトに達して
--   エラーになっていたと考えられる。
--   （自社の担当者にだけ割り当てられたリードを見る、通常のゲストアカウント
--   では、この「全リード閲覧」の判定経路を通らないため、今回のような
--   大きな遅延は発生しない。今回「全リード閲覧」を初めて実際に使った
--   ITCのアカウントで、初めて顕在化した不具合。）
--
--   対策：
--   管理者（admin）かどうかの判定が、すでにポリシーの一番外側で1回だけ
--   判定されて以降の行ごとの処理を省略できるようになっているのと同じ考え方で、
--   「全リード閲覧」フラグの判定も、can_view_lead() の中（リードの行ごとに
--   呼ばれる場所）ではなく、ポリシーの一番外側（1回だけ判定される場所）に
--   出す。これにより、「全リード閲覧」がONの会社のゲストがリード一覧を
--   開いたときは、最初に1回だけ自社のフラグを確認すれば、それ以降は
--   リードの件数に関わらず追加の確認処理なしで全件を表示できるようになる。
--   （can_view_lead() 関数自体はそのままにしてあるため、通常のゲスト
--   アカウント・calls/lead_attachments 側などの他の挙動に影響はない。）
-- ============================================================================

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select
  using (
    (select public.current_role()) = 'admin'
    or (
      (select public.current_can_view_all_leads())
      and status <> 'アポ禁'
    )
    or (public.can_view_lead(assigned_to) and status <> 'アポ禁')
  );

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update
  using (
    (select public.current_role()) = 'admin'
    or (
      (select public.current_can_view_all_leads())
      and status <> 'アポ禁'
    )
    or (public.can_view_lead(assigned_to) and status <> 'アポ禁')
  )
  with check (
    (select public.current_role()) = 'admin'
    or (select public.current_can_view_all_leads())
    or public.can_view_lead(assigned_to)
  );

-- 「所属会社名（org_name）で検索する」処理（can_view_lead() の中や、
-- プロフィール一覧の閲覧ポリシーなど）に使うインデックスが無かったため、
-- 念のため追加しておく（「全リード閲覧」をOFFのまま使う、通常のゲスト
-- アカウントの表示速度の改善・保険として）。
create index if not exists profiles_org_name_idx on public.profiles(org_name);
