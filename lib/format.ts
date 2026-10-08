export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// <input type="datetime-local"> 用 (ローカルタイムゾーン, 秒なし)
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "2026-09" のような年月文字列 <-> 表示用ラベル
export function formatMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return yyyyMm;
  return `${y}年${m}月`;
}

// 日本時間(JST)での「今月」。サーバーは UTC で動くため、そのまま getMonth() だと月初・月末で日本とズレる。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function currentMonthKey(now: Date = new Date()): string {
  const j = new Date(now.getTime() + JST_OFFSET_MS);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 日本時間(JST)での日付キー "YYYY-MM-DD"。ISO文字列や Date を渡すと、日本時間の何日かを返す。
export function jstDateKey(input: Date | string = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;
}

// yyyyMm ("2026-09") から offset ヶ月ずらした年月キーを返す（offset はマイナス可）
export function shiftMonthKey(yyyyMm: string, offset: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// yyyyMm ("2026-09") の月初・翌月初（日本時間の0:00を基準にした ISO 文字列）
export function monthRange(yyyyMm: string): { start: string; end: string } {
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - JST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 1) - JST_OFFSET_MS);
  return { start: start.toISOString(), end: end.toISOString() };
}

// 日本時間(JST, UTC+9)の「今日」の 0:00 〜 翌日 0:00 を ISO 文字列で返す。
// サーバー(Vercel)は UTC で動くため、new Date().setHours(0,0,0,0) だと日本時間の朝9時が区切りになってしまう。
// 日本は夏時間が無いので、+9時間の固定オフセットで正確に計算できる。
export function jstTodayRange(now: Date = new Date()): { start: string; end: string; label: string } {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate();
  const startMs = Date.UTC(y, m, d) - JST_OFFSET_MS;
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    label: `${y}年${m + 1}月${d}日`,
  };
}
