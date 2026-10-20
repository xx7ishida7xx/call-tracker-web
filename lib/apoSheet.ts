// アポ表（アポイント情報シート）の項目定義。
// 画面の入力フォーム・保存データ・Excel出力のすべてが、ここの定義を共通で使う。

export type ApoData = {
  sales_rep: string; // 営業担当
  apo_date: string; // アポ取得日（yyyy-mm-dd）
  pre_date: string; // 前確日（空なら「-」）
  pre_time: string; // 前確時間（空なら「-」）
  visit_date: string; // 訪問日
  visit_time: string; // 訪問時間（HH:mm）
  company: string; // 会社名（屋号名）
  genre: string; // 業種
  phone: string; // 電話番号
  mobile: string; // 携帯
  address: string; // 住所
  rep_name: string; // 代表者名
  gender: string; // 性別
  age: string; // 年齢
  meeting_time: string; // 商談時間
  approver: string; // 決裁者名
  attendee: string; // 同席
  cost_aware: string; // 費用認識
  appointer: string; // アポインター
  negotiator: string; // 商談者
  companion: string; // 同行者
  proposal: string; // 提案種別
  hp: string; // HP
  hp_vendor: string; // HP業者
  remaining_debt: string; // 残債
  ad_cost: string; // 広告費用
  ad_purpose: string; // 広告目的
  approval_flow: string; // 決裁フロー
  patient_handling: string; // 患者対応状況
  vendor_relations: string; // 業者付き合い
  duration: string; // 継続期間
  story: string; // 興味を引いたポイント、アポになった経緯
  memo: string; // 備考（シート下部の枠）
};

export const EMPTY_APO: ApoData = {
  sales_rep: "",
  apo_date: "",
  pre_date: "",
  pre_time: "",
  visit_date: "",
  visit_time: "",
  company: "",
  genre: "",
  phone: "",
  mobile: "",
  address: "",
  rep_name: "",
  gender: "",
  age: "",
  meeting_time: "",
  approver: "",
  attendee: "",
  cost_aware: "",
  appointer: "",
  negotiator: "",
  companion: "",
  proposal: "",
  hp: "",
  hp_vendor: "",
  remaining_debt: "",
  ad_cost: "",
  ad_purpose: "",
  approval_flow: "",
  patient_handling: "",
  vendor_relations: "",
  duration: "",
  story: "",
  memo: "",
};

// 保存されているデータ（古い・足りない項目があっても）を、必ず全項目が揃った形にそろえる
export function normalizeApoData(raw: unknown): ApoData {
  const out: ApoData = { ...EMPTY_APO };
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(EMPTY_APO) as (keyof ApoData)[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === "string") out[key] = v;
    }
  }
  return out;
}

// 入力欄の候補（元のExcelの入力規則・実際の記入例にあわせている。自由入力もできる）
export const APO_SUGGESTIONS = {
  sales_rep: ["橋本", "斎藤", "森", "木下", "石井", "佐藤"],
  negotiator: ["橋本", "斎藤", "森", "木下", "石井", "佐藤"],
  gender: ["男性", "女性"],
  age: ["20～30代", "30～40代", "40～50代", "50～60代", "60代以上"],
  meeting_time: ["30分", "1時間", "1時間30分", "2時間"],
  attendee: ["あり", "なし"],
  cost_aware: ["有り", "無し"],
  companion: ["無し"],
  proposal: ["HP", "動画", "Web"],
} as const;

// 保存名に使えない文字を除いたファイル名（例：アポ表_有限会社花季_20261016.xlsx）
export function apoFileName(d: ApoData): string {
  const company = (d.company || "会社名未入力").replace(/[\\/:*?"<>|\r\n]/g, "").trim().slice(0, 40) || "会社名未入力";
  const date = (d.visit_date || d.apo_date || "").replace(/-/g, "");
  return `アポ表_${company}${date ? `_${date}` : ""}.xlsx`;
}
