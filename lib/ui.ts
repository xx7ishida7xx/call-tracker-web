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

// 検索・絞り込みなど「情報を探す」系のアクション用（新規作成・保存はオレンジ、検索系は青で用途を分けています）
export const btnAccentCls =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50";

export const cardCls = "rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-100";

// 実績・件数などの数値をまとめて見せるパネル用（lisnaviの水色サイドバーを参考に、数値が目立つよう配色）
export const statChipCls = "flex flex-col gap-1 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3";

export const statChipLabelCls = "text-[11px] font-semibold tracking-wide text-sky-700/80";

export const statChipValueCls = "text-2xl font-bold tabular-nums text-slate-900";

// フォーム内で項目をグループ分けする際の小見出し（lisnaviの「基本情報／更新情報」のような区切りを参考）
export const fieldGroupLabelCls =
  "col-span-2 mt-3 border-t border-slate-100 pt-3 text-[11px] font-bold uppercase tracking-wide text-orange-600/80 first:mt-0 first:border-0 first:pt-0";

export const sectionTitleCls = "text-sm font-bold tracking-tight text-slate-900";

export const labelCls = "text-xs font-semibold text-slate-500";

export const errorCls = "rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600";

export const successCls = "rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700";

export const STATUS_BADGE_CLS: Record<string, string> = {
  未着手: "bg-slate-100 text-slate-600",
  架電中: "bg-sky-100 text-sky-700",
  見込み: "bg-teal-100 text-teal-700",
  前確待ち: "bg-indigo-100 text-indigo-700",
  前確NG: "bg-pink-100 text-pink-700",
  アポ獲得: "bg-amber-100 text-amber-800",
  成約: "bg-emerald-100 text-emerald-700",
  コールアウト: "bg-slate-100 text-slate-500",
  BK: "bg-violet-100 text-violet-700",
  対象外: "bg-rose-100 text-rose-600",
  アポ禁: "bg-slate-800 text-white",
};

export function statusBadgeCls(status: string) {
  return STATUS_BADGE_CLS[status] ?? "bg-slate-100 text-slate-600";
}
