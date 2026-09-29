// 共通のスタイル定義（配色・フォームパーツなど）
// ブランドカラーはオレンジを基調にしています。

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100";

export const btnPrimaryCls =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50";

export const btnSecondaryCls =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50";

export const btnSecondarySmCls =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50";

export const cardCls = "rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-100";

export const sectionTitleCls = "text-sm font-bold tracking-tight text-slate-900";

export const labelCls = "text-xs font-semibold text-slate-500";

export const errorCls = "rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600";

export const successCls = "rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700";

export const STATUS_BADGE_CLS: Record<string, string> = {
  未着手: "bg-slate-100 text-slate-600",
  架電中: "bg-sky-100 text-sky-700",
  アポ獲得: "bg-amber-100 text-amber-800",
  成約: "bg-emerald-100 text-emerald-700",
  見送り: "bg-slate-100 text-slate-500",
  対象外: "bg-rose-100 text-rose-600",
};

export function statusBadgeCls(status: string) {
  return STATUS_BADGE_CLS[status] ?? "bg-slate-100 text-slate-600";
}
