export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
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

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// yyyyMm ("2026-09") から offset ヶ月ずらした年月キーを返す（offset はマイナス可）
export function shiftMonthKey(yyyyMm: string, offset: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// yyyyMm ("2026-09") の月初・翌月初（どちらもローカルタイムゾーンの ISO 文字列）
export function monthRange(yyyyMm: string): { start: string; end: string } {
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
