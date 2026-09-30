// 「稼働日カレンダー」の判定ロジック。
//
// 既定のルール：平日（月〜金）かつ祝日でなければ稼働日、それ以外（土日・祝日）は休み。
// 稼働日カレンダー（work_day_overrides）に登録がある日は、その登録が既定より優先される。
// 個人の登録は、会社全体の登録よりさらに優先される。

import { getNationalHolidays } from "./holidays";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isWeekendDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

// 対象の年月に関係する祝日一覧（月またぎを考慮して前後1年分もまとめて用意する）
export function holidayMapForMonth(monthKey: string): Map<string, string> {
  const [y] = monthKey.split("-").map(Number);
  return getNationalHolidays([y - 1, y, y + 1]);
}

// 何もカレンダー登録が無い日の既定値：平日かつ祝日でなければ稼働日
export function defaultIsWorking(dateStr: string, holidays: Map<string, string>): boolean {
  return !isWeekendDate(dateStr) && !holidays.has(dateStr);
}

// 会社全体・個人の登録（上書き）を踏まえた、実際の稼働日判定
export function resolveIsWorking(
  dateStr: string,
  holidays: Map<string, string>,
  companyOverride: boolean | undefined,
  personalOverride: boolean | undefined
): boolean {
  if (personalOverride !== undefined) return personalOverride;
  if (companyOverride !== undefined) return companyOverride;
  return defaultIsWorking(dateStr, holidays);
}

// 月内の日付一覧（"YYYY-MM-DD"）を1日から末日まで返す
export function datesInMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) out.push(`${y}-${pad2(m)}-${pad2(d)}`);
  return out;
}

// 曜日ラベル（月内カレンダーの表示用）
export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
export function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
}

// その日付が何週目か（月内の第n週、1始まり）。週の始まりは日曜日。
export function weekOfMonth(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  return Math.ceil((d + firstDow) / 7);
}
