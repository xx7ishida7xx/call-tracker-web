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

export interface Profile {
  id: string;
  email: string;
  name: string;
  display_name: string | null;
  role: Role;
  is_owner: boolean;
  team_lead_id: string | null;
  org_name: string | null; // ゲストチームに設定する会社名（販売店が決まったら設定）
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
  contracts: ContractItem[];
  custom: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// 契約状況（HP・MEO・SNS運用など、商材ごとに複数登録できます）
export interface ContractItem {
  product: string; // 商材名（例：HP、MEO、SNS運用）
  company: string; // 契約会社名
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
  recall_at: string | null;
  recall_target: string | null;
  appointment: boolean;
  connected: boolean; // 有効架電（担当者と話せた）かどうか
  notes: string;
  created_at: string;
}

export const LEAD_STATUSES = [
  "未着手",
  "架電中",
  "アポ獲得",
  "成約",
  "見送り",
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
