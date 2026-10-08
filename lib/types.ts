// guest_admin: ゲストチーム（販売店など）のまとめ役。teamlead と同じように、
// 自分のチーム（team_lead_id で紐づく配下のゲストメンバー）のリードを扱える。
// guest_member: そのゲストチームの一般メンバー。staff と同じく自分の担当分のみ。
export type Role = "admin" | "teamlead" | "staff" | "guest_admin" | "guest_member";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "管理者",
  teamlead: "チームリーダー",
  staff: "スタッフ",
  guest_admin: "ゲスト管理者",
  guest_member: "ゲストメンバー",
};

export const ROLE_ORDER: Role[] = ["admin", "teamlead", "staff", "guest_admin", "guest_member"];

// team_lead_id の「配下グループのまとめ役」となるロール（このロールの人だけが
// team_lead_id の候補として選べる）
export const GUEST_ROLES: Role[] = ["guest_admin", "guest_member"];

// ゲスト（guest_admin / guest_member）かどうか。稼働日カレンダーで、会社全体の
// 登録をゲストには反映させない（ゲストは個人の登録と既定値のみで判定する）ために使う。
export function isGuestRole(role: Role): boolean {
  return (GUEST_ROLES as Role[]).includes(role);
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  display_name: string | null;
  role: Role;
  is_owner: boolean;
  team_lead_id: string | null;
  org_name: string | null; // 所属する会社名（companies テーブルの名前と一致。社内・ゲストとも設定する）
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  company: string;
  pref: string;
  address: string;
  phone: string;
  email: string;
  url: string;
  cms: string;
  genre: string;
  subgenre: string;
  hp_status: string; // HPの状態（HP_STATUS_OPTIONS のどれか。未設定は空文字）
  status: string;
  assigned_to: string | null;
  last_call_at: string | null;
  last_call_staff: string | null;
  recall_at: string | null;
  recall_target: string | null;
  rep_name: string | null;
  rep_mobile: string | null;
  contact_name: string | null;
  contact_mobile: string | null;
  credit_company: string; // 信販会社（割賦契約の場合の信販会社名）
  acquisition_desire: string; // 集客意欲（"有" / "無" / 未設定は空文字）
  contracts: ContractItem[];
  custom: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// HPの状態（そのリードのホームページの状況）。リード一覧で、文字を入力せずに
// チェックを入れるだけで絞り込めるようにするための選択式の項目。
// DBには下の文字列がそのまま保存される（取り込みCSVの「HPの状態」列も、この文字列と同じ）。
export const HP_STATUS_OPTIONS = [
  "古いHP(特に古い)",
  "古いHP(やや古い)",
  "HP未確認",
  "無料ツールのHP",
] as const;

// 各選択肢の意味（一覧・詳細画面での補足説明に使う）
export const HP_STATUS_HELP: Record<(typeof HP_STATUS_OPTIONS)[number], string> = {
  "古いHP(特に古い)": "古さの兆候が多く重なっているHP（スマホ非対応・http・古い©年など）",
  "古いHP(やや古い)": "古さの兆候がいくつかあるHP",
  HP未確認: "Googleマップに自社のHPが登録されていない（実際にはある場合もあるので電話時に確認）",
  "無料ツールのHP": "Wix・Jimdo・ペライチ・Googleサイトなど、無料ツールで作ったHP",
};

// 集客意欲の選択肢。保存する値は既存データとの互換性のため "有"/"無" のまま。
// 画面上の表示だけ、ホームページ／MEO／SNS運用の有無と表記をそろえて「あり」「なし」にする。
export const ACQUISITION_DESIRE_OPTIONS = ["有", "無"] as const;
export const ACQUISITION_DESIRE_LABEL: Record<(typeof ACQUISITION_DESIRE_OPTIONS)[number], string> = {
  有: "あり",
  無: "なし",
};

// 契約状況（HP・MEO・SNS運用など、商材ごとに複数登録できます）
export interface ContractItem {
  product: string; // 商材名（例：HP、MEO、SNS運用）
  company: string; // 契約会社名
  active: boolean; // この商材を契約中（有）かどうか。リード一覧の「◯◯有無」検索はこのチェックを見て判定する
  billing_type: string; // 契約形態（サブスク／割賦 など）
  monthly_fee: string; // 月額（円）
  period: string; // 契約期間（例：2026/10〜2027/09、12ヶ月 など自由記入）
}

// 新規リードの「契約状況」欄に、最初から並べておく商材名
export const DEFAULT_CONTRACT_PRODUCTS = ["HP", "MEO", "SNS運用", "", ""];

export const BILLING_TYPES = ["サブスク", "割賦"] as const;

// CSVインポートしたデータに含まれる業種カテゴリ（絞り込み用）
export const GENRES = [
  "IT・Web・広告",
  "その他サービス",
  "スポーツ・フィットネス",
  "ペット",
  "公共・団体・NPO",
  "医療・福祉",
  "士業・コンサル・人材",
  "宿泊・観光・レジャー",
  "小売・EC",
  "建設・不動産",
  "教育・スクール",
  "文化・芸術・メディア",
  "美容・健康",
  "自動車・整備",
  "製造・メーカー",
  "農業・環境",
  "運輸・物流",
  "運送・物流",
  "金融・保険",
  "飲食・食品",
] as const;

// 絞り込み用の都道府県一覧
export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

export interface Call {
  id: string;
  lead_id: string;
  caller_id: string | null;
  called_at: string;
  result: string;
  result_group: string | null; // 結果を選んだ際のグループ（つながらなかった／つながった／その他／訪問結果）
  recall_at: string | null;
  recall_target: string | null;
  appointment: boolean;
  appointment_credit_to: string | null; // アポ件数の成績が付く人（前確待ちからのアポ確定では、前確依頼をした人）
  connected: boolean; // 有効架電（担当者と話せた）かどうか
  notes: string;
  rank: string | null; // 通話ごとの見込み度ランク（A/B/C/D、未選択はnull）
  hot: boolean; // 「激アツ!!」フラグ
  created_at: string;
}

// ==========================================================================
// リード添付ファイル（診断レポート／アポ表）
// 実ファイルは Supabase Storage の lead-attachments バケットに保存し、
// このテーブルはメタ情報（保存パス・元のファイル名・区分など）だけを持つ。
// ==========================================================================

export const ATTACHMENT_CATEGORIES = ["診断レポート", "アポ表"] as const;
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

// 添付ファイル1件あたりの上限サイズ（バケット側の file_size_limit と合わせている）
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB

export interface LeadAttachment {
  id: string;
  lead_id: string;
  category: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  note: string;
  uploaded_by: string | null;
  created_at: string;
}

// ==========================================================================
// コール結果taxonomy（Round 2）
// つながらなかった／つながった／その他／訪問結果 の4グループに結果を分類し、
// 結果を選ぶと「有効架電」「アポ獲得」「ステータス」が自動で連動する。
// ==========================================================================

export type CallOutcome = { connected: boolean; appointment: boolean; nextStatus: string | null };

export const CALL_RESULT_GROUP_ORDER = ["つながらなかった", "つながった", "その他", "訪問結果"] as const;
export type CallResultGroup = (typeof CALL_RESULT_GROUP_ORDER)[number];

export const CALL_RESULT_GROUPS: Record<CallResultGroup, readonly string[]> = {
  つながらなかった: ["留守", "話中", "廃業", "再コール"],
  つながった: ["フロントNG", "代表NG", "追わない", "再コール", "前確依頼", "前確NG", "アポ確定", "アポ禁"],
  その他: ["結果待ち", "キャンセル"],
  訪問結果: ["受注", "追客", "検討", "第三者商談", "先々", "失注", "BK"],
};

// 「つながらなかった」の再コールと「つながった」の再コールは、表示は同じ「再コール」だが
// グループが違うため別物として区別して保存・連動される（result_group列で区別する）。
// nextStatus が null の場合は「ステータスは変更しない」を意味する。
//
// ステータス自動連動（2026-10-02 見直し）：
//   つながらなかった：留守→架電中／話中→架電中／廃業→対象外／再コール→架電中
//   つながった：フロントNG・代表NG・追わない→コールアウト／再コール→見込み／
//              前確依頼→前確待ち／前確NG→前確NG／アポ確定→アポ確定／アポ禁→アポ禁
//   （前確待ちのリードを、前確した人が「アポ確定」にしても、アポの成績は前確依頼をした人に付く）
//   その他：結果待ち→変更なし／キャンセル→コールアウト
//   訪問結果：受注→成約／追客・検討・第三者商談・先々→変更なし／失注→コールアウト／BK→BK
export const CALL_RESULT_OUTCOME: Record<CallResultGroup, Record<string, CallOutcome>> = {
  つながらなかった: {
    留守: { connected: false, appointment: false, nextStatus: "架電中" },
    話中: { connected: false, appointment: false, nextStatus: "架電中" },
    廃業: { connected: false, appointment: false, nextStatus: "対象外" },
    再コール: { connected: false, appointment: false, nextStatus: "架電中" },
  },
  つながった: {
    フロントNG: { connected: true, appointment: false, nextStatus: "コールアウト" },
    代表NG: { connected: true, appointment: false, nextStatus: "コールアウト" },
    追わない: { connected: true, appointment: false, nextStatus: "コールアウト" },
    再コール: { connected: true, appointment: false, nextStatus: "見込み" },
    前確依頼: { connected: true, appointment: false, nextStatus: "前確待ち" },
    前確NG: { connected: true, appointment: false, nextStatus: "前確NG" },
    アポ確定: { connected: true, appointment: true, nextStatus: "アポ確定" },
    アポ禁: { connected: true, appointment: false, nextStatus: "アポ禁" },
  },
  その他: {
    結果待ち: { connected: false, appointment: false, nextStatus: null },
    キャンセル: { connected: false, appointment: false, nextStatus: "コールアウト" },
  },
  訪問結果: {
    受注: { connected: true, appointment: false, nextStatus: "成約" },
    追客: { connected: true, appointment: false, nextStatus: null },
    検討: { connected: true, appointment: false, nextStatus: null },
    第三者商談: { connected: true, appointment: false, nextStatus: null },
    先々: { connected: true, appointment: false, nextStatus: null },
    失注: { connected: true, appointment: false, nextStatus: "コールアウト" },
    BK: { connected: true, appointment: false, nextStatus: "BK" },
  },
};

// その他グループの自由入力欄を選んだ場合の自動連動（定型結果に一致しない場合のフォールバックにも使う）
export const FREE_TEXT_OUTCOME: CallOutcome = { connected: false, appointment: false, nextStatus: null };

export function getCallOutcome(group: string, result: string): CallOutcome {
  const table = CALL_RESULT_OUTCOME[group as CallResultGroup];
  return (table && table[result]) || FREE_TEXT_OUTCOME;
}

// 通話ごとの見込み度ランク（「なし」は空文字列/nullとして扱う）
export const CALL_RANKS = ["A", "B", "C", "D"] as const;

// リード一覧の絞り込み（コール履歴）で使う、結果のフラットな選択肢一覧。
// 「再コール」はグループをまたいで重複するため1つにまとめている。
export const CALL_RESULT_FLAT_OPTIONS: string[] = Array.from(
  new Set(CALL_RESULT_GROUP_ORDER.flatMap((g) => CALL_RESULT_GROUPS[g]))
);

export const LEAD_STATUSES = [
  "未着手",
  "架電中",
  "見込み",
  "前確待ち",
  "前確NG",
  "アポ確定",
  "成約",
  "コールアウト",
  "BK",
  "対象外",
  "アポ禁",
] as const;

// 「アポ禁」＝今後連絡してはいけない先。マスター管理者（オーナー）・管理者以外には
// 一覧・詳細のどこにも表示しない特別なステータス（実際の閲覧制限はデータベース側のRLSで行う）。
export const APO_KIN_STATUS = "アポ禁";

// 参照元（旧:元CMS）。取り込んだリストの元CMSベンダーで分類する。
// 「その他」を選んだ場合は、さらに下の階層で具体的なサービス名を選べるようにする。
export const CMS_MAIN_OPTIONS = ["A社製CMS", "G社製CMS", "WIX", "WordPress", "その他"] as const;

// 「その他」を選んだときに選べる、実際に取り込み実績のあるサービス名
// （件数の多い順）。ここにないものは「その他（自由入力）」で個別に入力する。
export const CMS_OTHER_SUBOPTIONS = [
  "ant2 secure-cms",
  "サイト職人CMS",
  "BlueMonkey",
  "ペライチ",
  "グーペ",
  "Wantedly",
  "STORES",
  "Jimdo",
] as const;

// リード一覧の絞り込みで使う、参照元のフラットな選択肢一覧
// （4大分類＋その他の下位選択肢をすべて並べたもの）
export const CMS_FILTER_OPTIONS = [...CMS_MAIN_OPTIONS.slice(0, 4), ...CMS_OTHER_SUBOPTIONS, "その他"] as const;

export function nameFor(p: Pick<Profile, "display_name" | "name" | "email"> | null | undefined): string {
  if (!p) return "（不明なメンバー）";
  return p.display_name || p.name || p.email || "（名称未設定）";
}

export function canManageMembers(me: Profile | null): boolean {
  if (!me) return false;
  return me.is_owner || me.role === "admin";
}

// 指定した相手の表示名/ロールを自分が編集できるか
export function canEditProfile(me: Profile | null, target: Profile): boolean {
  if (!me) return false;
  if (me.id === target.id) return true;
  if (me.is_owner) return true;
  if (me.role === "admin" && !target.is_owner && target.role !== "admin") return true;
  return false;
}

// ==========================================================================
// 目標管理・稼働日カレンダー：権限判定
// 本人が自分の目標・個人カレンダーを入力する運用は今回は含めないため、
// 「本人」は対象に含めない（管理者・オーナー・直属の上司のみが登録・変更できる）。
// データベース側（Supabase RLS）の can_manage_profile_goals と同じロジック。
// ==========================================================================
export function canManageProfileGoals(me: Profile | null, target: Profile): boolean {
  if (!me) return false;
  if (me.is_owner || me.role === "admin") return true;
  if ((me.role === "teamlead" || me.role === "guest_admin") && target.team_lead_id === me.id) return true;
  return false;
}

// 閲覧は「本人」も含む（管理できるかどうかに関わらず、自分の分は見られる）
export function canViewProfileGoals(me: Profile | null, target: Profile): boolean {
  if (!me) return false;
  if (me.id === target.id) return true;
  return canManageProfileGoals(me, target);
}

// 自分が目標・カレンダーを管理できる相手（配下メンバー）を一覧から絞り込む
export function manageableProfiles(me: Profile | null, roster: Profile[]): Profile[] {
  if (!me) return [];
  return roster.filter((p) => canManageProfileGoals(me, p));
}

// ==========================================================================
// リードのコメント（チャット）。宛先を選ぶと、宛先の人に未読の目印が出る。
// ==========================================================================
export interface LeadComment {
  id: string;
  lead_id: string;
  author_id: string | null;
  to_profile_id: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
}
