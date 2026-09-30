// 日本の祝日を計算で求めるユーティリティ。
//
// 「稼働日カレンダー」で何も登録が無い日の既定値（平日かつ祝日でなければ稼働日）や、
// カレンダー画面を開いたときの初期チェック状態の提案に使う。実際にその月を稼働日として
// 扱うかどうかは、最終的には稼働日カレンダー（work_day_overrides）の登録内容が優先される
// ので、この一覧が多少ずれていても、管理者がカレンダー画面でチェックを直せば問題ない。
//
// 春分の日・秋分の日は天文計算に基づく近似式（2000〜2099年の範囲で一般的に使われているもの）
// を使用している。振替休日・国民の休日のルールも反映している。

export type HolidayMap = Map<string, string>; // "YYYY-MM-DD" -> 祝日名

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function dayOfWeek(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getDay(); // 0=日 ... 6=土
}

// その月の第n月曜日の「日」を返す（ハッピーマンデー対応の祝日用）
function nthMonday(year: number, month: number, n: number): number {
  const firstDow = dayOfWeek(year, month, 1);
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return firstMonday + (n - 1) * 7;
}

// 春分の日・秋分の日（近似式）
function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

// 指定した1年分の祝日一覧を計算する（振替休日・国民の休日を含む）
export function getJapaneseNationalHolidays(year: number): HolidayMap {
  const map: HolidayMap = new Map();
  const add = (m: number, d: number, name: string) => map.set(iso(year, m, d), name);

  add(1, 1, "元日");
  add(1, nthMonday(year, 1, 2), "成人の日");
  add(2, 11, "建国記念の日");
  add(2, 23, "天皇誕生日");
  add(3, vernalEquinoxDay(year), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  add(7, nthMonday(year, 7, 3), "海の日");
  add(8, 11, "山の日");
  add(9, nthMonday(year, 9, 3), "敬老の日");
  add(9, autumnalEquinoxDay(year), "秋分の日");
  add(10, nthMonday(year, 10, 2), "スポーツの日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  // 振替休日：祝日が日曜なら、その次の「まだ祝日でない日」を振替休日にする
  const sundays = Array.from(map.keys()).filter((key) => {
    const [y, m, d] = key.split("-").map(Number);
    return dayOfWeek(y, m, d) === 0;
  });
  for (const key of sundays) {
    const [y, m, d] = key.split("-").map(Number);
    const cursor = new Date(y, m - 1, d);
    do {
      cursor.setDate(cursor.getDate() + 1);
    } while (map.has(iso(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate())));
    map.set(iso(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()), "振替休日");
  }

  // 国民の休日：前後を祝日に挟まれた「祝日でない平日」を休日にする（シルバーウィークなど）
  const snapshot = Array.from(map.keys());
  for (const key of snapshot) {
    const [y, m, d] = key.split("-").map(Number);
    const between = new Date(y, m - 1, d + 1);
    const next = new Date(y, m - 1, d + 2);
    const betweenKey = iso(between.getFullYear(), between.getMonth() + 1, between.getDate());
    const nextKey = iso(next.getFullYear(), next.getMonth() + 1, next.getDate());
    const betweenDow = between.getDay();
    if (map.has(nextKey) && !map.has(betweenKey) && betweenDow !== 0 && betweenDow !== 6) {
      map.set(betweenKey, "国民の休日");
    }
  }

  return map;
}

// 指定した年のリストの祝日を1つの Map にまとめて返す（月またぎを考慮して前後の年もまとめて渡す）
export function getNationalHolidays(years: number[]): HolidayMap {
  const merged: HolidayMap = new Map();
  for (const y of years) {
    for (const [key, name] of getJapaneseNationalHolidays(y)) merged.set(key, name);
  }
  return merged;
}
