import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { nameFor, LEAD_STATUSES, GENRES, PREFECTURES, canManageMembers, type Profile } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import AssigneeCell from "./AssigneeCell";
import {
  btnAccentCls,
  btnPrimaryCls,
  btnSecondarySmCls,
  cardCls,
  inputCls,
  statChipCls,
  statChipLabelCls,
  statusBadgeCls,
} from "@/lib/ui";

const PAGE_SIZE = 50;

type LeadRow = {
  id: string;
  company: string;
  pref: string;
  phone: string;
  status: string;
  assigned_to: string | null;
  last_call_at: string | null;
  recall_at: string | null;
  created_at: string;
  assigned: { id: string; name: string; display_name: string | null; email: string } | null;
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    assignee?: string;
    genre?: string | string[];
    pref?: string | string[];
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) return null;

  // 業種・都道府県は複数選択できるようにしているため、常に配列として扱う
  const genreList = Array.isArray(sp.genre) ? sp.genre : sp.genre ? [sp.genre] : [];
  const prefList = Array.isArray(sp.pref) ? sp.pref : sp.pref ? [sp.pref] : [];

  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("leads")
    .select(
      "id,company,pref,phone,status,assigned_to,last_call_at,recall_at,created_at,assigned:profiles!leads_assigned_to_fkey(id,name,display_name,email)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim().replace(/[%,]/g, "");
    query = query.or(`company.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  }
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.assignee) query = query.eq("assigned_to", sp.assignee);
  if (genreList.length > 0) query = query.in("genre", genreList);
  if (prefList.length > 0) query = query.in("pref", prefList);

  const { data, count, error } = await query;
  const leads = (data as unknown as LeadRow[]) ?? [];

  // 実績パネル用：ステータス別の全体件数（絞り込み条件に関わらず全体を表示）
  const { count: totalAll } = await supabase.from("leads").select("id", { count: "exact", head: true });
  const statusCounts = await Promise.all(
    LEAD_STATUSES.map(async (status) => {
      const { count: c } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return { status, count: c ?? 0 };
    })
  );

  const canManage = canManageMembers(me);
  let roster: Profile[] = [];
  if (canManage) {
    const { data: rosterData } = await supabase.from("profiles").select("*").order("role");
    roster = (rosterData as Profile[]) ?? [];
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function hrefFor(p: number) {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.status) params.set("status", sp.status);
    if (sp.assignee) params.set("assignee", sp.assignee);
    genreList.forEach((g) => params.append("genre", g));
    prefList.forEach((pr) => params.append("pref", pr));
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/leads?${s}` : "/leads";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">リード一覧</h1>
          <p className="mt-0.5 text-sm text-slate-500">{total.toLocaleString()} 件のリードが登録されています</p>
        </div>
        <Link href="/leads/new" className={btnPrimaryCls}>
          + 新規リード追加
        </Link>
      </div>

      {/* 実績パネル：全体のステータス別件数をひと目で確認できます */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className={statChipCls}>
          <span className={statChipLabelCls}>総件数</span>
          <span className="text-lg font-bold tabular-nums text-slate-900">{(totalAll ?? 0).toLocaleString()}</span>
        </div>
        {statusCounts.map((s) => (
          <div key={s.status} className={statChipCls}>
            <span className={statChipLabelCls}>{s.status}</span>
            <span className="text-lg font-bold tabular-nums text-slate-900">{s.count.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <form className={`flex flex-wrap items-end gap-3 ${cardCls} p-4`}>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          会社名・電話番号・メール
          <input type="text" name="q" defaultValue={sp.q} placeholder="検索キーワード" className={`w-56 ${inputCls}`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          ステータス
          <select name="status" defaultValue={sp.status || ""} className={inputCls}>
            <option value="">すべて</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <MultiSelectFilter label="業種" name="genre" options={GENRES} selected={genreList} />
        <MultiSelectFilter label="都道府県" name="pref" options={PREFECTURES} selected={prefList} />
        {canManage && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            担当者
            <select name="assignee" defaultValue={sp.assignee || ""} className={inputCls}>
              <option value="">すべて</option>
              {roster.map((r) => (
                <option key={r.id} value={r.id}>
                  {nameFor(r)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className={btnAccentCls}>
          絞り込む
        </button>
        {(sp.q || sp.status || sp.assignee || genreList.length > 0 || prefList.length > 0) && (
          <Link href="/leads" className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-orange-600">
            条件をクリア
          </Link>
        )}
      </form>

      {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">読み込みエラー: {error.message}</p>}

      <div className={`overflow-x-auto ${cardCls}`}>
        <table className="w-full min-w-[840px] text-sm">
          <thead>
            <tr className="border-b border-orange-100 bg-orange-50/60 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-2.5">会社名</th>
              <th className="px-4 py-2.5">都道府県</th>
              <th className="px-4 py-2.5">電話番号</th>
              <th className="px-4 py-2.5">ステータス</th>
              <th className="px-4 py-2.5">担当者</th>
              <th className="px-4 py-2.5">最終架電</th>
              <th className="px-4 py-2.5">次回架電予定</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-orange-50/40">
                <td className="px-4 py-2.5">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-orange-600 hover:underline">
                    {lead.company || "（会社名未登録）"}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{lead.pref}</td>
                <td className="px-4 py-2.5 text-slate-600">
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="hover:text-orange-600 hover:underline" title="この番号に発信する">
                      {lead.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-2.5 text-slate-600">
                  {canManage ? (
                    <AssigneeCell leadId={lead.id} assignedTo={lead.assigned_to} roster={roster} />
                  ) : lead.assigned ? (
                    nameFor(lead.assigned)
                  ) : (
                    "未割当"
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(lead.last_call_at)}</td>
                <td className="px-4 py-2.5 text-slate-500">{formatDateTime(lead.recall_at)}</td>
              </tr>
            ))}
            {leads.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  条件に一致するリードがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Link
            href={hrefFor(Math.max(1, page - 1))}
            className={page <= 1 ? "pointer-events-none rounded-lg border border-slate-100 px-3 py-1 text-slate-300" : btnSecondarySmCls}
          >
            前へ
          </Link>
          <span className="text-slate-500">
            {page} / {totalPages} ページ
          </span>
          <Link
            href={hrefFor(Math.min(totalPages, page + 1))}
            className={page >= totalPages ? "pointer-events-none rounded-lg border border-slate-100 px-3 py-1 text-slate-300" : btnSecondarySmCls}
          >
            次へ
          </Link>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeCls(status)}`}>
      {status}
    </span>
  );
}

// 業種・都道府県のように選択肢が多い項目を、チェックボックスで複数選べるようにする
// 絞り込み用ドロップダウン。JavaScript不要の <details> 要素で開閉しています。
function MultiSelectFilter({
  label,
  name,
  options,
  selected,
}: {
  label: string;
  name: string;
  options: readonly string[];
  selected: string[];
}) {
  return (
    <div className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
      {label}
      <details className="relative">
        <summary
          className={`${inputCls} flex cursor-pointer select-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden`}
        >
          <span className="truncate">{selected.length === 0 ? "すべて" : `${selected.length}件選択中`}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 text-slate-400">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="absolute z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 rounded px-2 py-1 text-sm font-normal text-slate-700 hover:bg-orange-50">
              <input
                type="checkbox"
                name={name}
                value={opt}
                defaultChecked={selected.includes(opt)}
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              {opt}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
