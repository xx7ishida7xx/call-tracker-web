import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  nameFor,
  LEAD_STATUSES,
  GENRES,
  PREFECTURES,
  CMS_FILTER_OPTIONS,
  CALL_RESULT_FLAT_OPTIONS,
  CALL_RANKS,
  ACQUISITION_DESIRE_OPTIONS,
  ACQUISITION_DESIRE_LABEL,
  APO_KIN_STATUS,
  canManageMembers,
  type Profile,
} from "@/lib/types";
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

type SearchParams = {
  // 顧客名・電話番号・代表者・信販会社（部分一致／前方一致）
  company?: string;
  phone_prefix?: string;
  rep?: string;
  credit_company?: string;
  // ステータス・担当
  status?: string;
  assignee?: string;
  // 地域・業種・参照元（複数選択）
  genre?: string | string[];
  pref?: string | string[];
  cms?: string | string[];
  // コール履歴
  caller?: string;
  call_result?: string;
  call_rank?: string;
  call_hot?: string;
  // 次回アタック日
  recall_from?: string;
  recall_to?: string;
  // ホームページ関連
  has_url?: string;
  has_meo?: string;
  has_sns?: string;
  acquisition_desire?: string;
  // ページング・検索実行フラグ（このフラグが無い間はリード一覧を表示しない）
  page?: string;
  searched?: string;
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) return null;
  const canManage = canManageMembers(me);

  // 業種・都道府県・参照元は複数選択できるようにしているため、常に配列として扱う
  const genreList = Array.isArray(sp.genre) ? sp.genre : sp.genre ? [sp.genre] : [];
  const prefList = Array.isArray(sp.pref) ? sp.pref : sp.pref ? [sp.pref] : [];
  const cmsList = Array.isArray(sp.cms) ? sp.cms : sp.cms ? [sp.cms] : [];

  // 「アポ禁」はオーナー・管理者以外には見せない（データ自体もRLSで見えなくなるが、
  // 絞り込み欄や件数表示にも選択肢として出さないようにする）
  const visibleStatuses = canManage ? LEAD_STATUSES : LEAD_STATUSES.filter((s) => s !== APO_KIN_STATUS);

  // 検索ボタンを押すまでは一覧を表示しない（searched=1 が付いているかどうかで判定）
  const hasSearched = sp.searched === "1";

  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let roster: Profile[] = [];
  if (canManage) {
    const { data: rosterData } = await supabase.from("profiles").select("*").order("role");
    roster = (rosterData as Profile[]) ?? [];
  }

  let leads: LeadRow[] = [];
  let total = 0;
  let queryError: { message: string } | null = null;

  if (hasSearched) {
    // コール履歴（コール者・結果・ランク・激アツ!!）は calls テーブル側の条件なので、
    // 先に該当するリードIDを集めてから leads を絞り込む
    let callLeadIds: string[] | null = null;
    if (sp.caller || sp.call_result || sp.call_rank || sp.call_hot === "1") {
      let callsQuery = supabase.from("calls").select("lead_id");
      if (sp.caller) callsQuery = callsQuery.eq("caller_id", sp.caller);
      if (sp.call_result) callsQuery = callsQuery.eq("result", sp.call_result);
      if (sp.call_rank) callsQuery = callsQuery.eq("rank", sp.call_rank);
      if (sp.call_hot === "1") callsQuery = callsQuery.eq("hot", true);
      const { data: callRows } = await callsQuery;
      callLeadIds = Array.from(new Set((callRows ?? []).map((r) => r.lead_id as string)));
    }

    let query = supabase
      .from("leads")
      .select(
        "id,company,pref,phone,status,assigned_to,last_call_at,recall_at,created_at,assigned:profiles!leads_assigned_to_fkey(id,name,display_name,email)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (sp.company && sp.company.trim()) {
      const c = sp.company.trim().replace(/[%,]/g, "");
      query = query.ilike("company", `%${c}%`);
    }
    if (sp.phone_prefix && sp.phone_prefix.trim()) {
      const p = sp.phone_prefix.trim().replace(/[%,]/g, "");
      query = query.ilike("phone", `${p}%`);
    }
    if (sp.rep && sp.rep.trim()) {
      const r = sp.rep.trim().replace(/[%,]/g, "");
      query = query.ilike("rep_name", `%${r}%`);
    }
    if (sp.credit_company && sp.credit_company.trim()) {
      const cc = sp.credit_company.trim().replace(/[%,]/g, "");
      query = query.ilike("credit_company", `%${cc}%`);
    }
    if (sp.status) query = query.eq("status", sp.status);
    if (sp.assignee) query = query.eq("assigned_to", sp.assignee);
    if (genreList.length > 0) query = query.in("genre", genreList);
    if (prefList.length > 0) query = query.in("pref", prefList);
    if (cmsList.length > 0) query = query.in("cms", cmsList);
    if (sp.recall_from) query = query.gte("recall_at", new Date(`${sp.recall_from}T00:00:00`).toISOString());
    if (sp.recall_to) query = query.lte("recall_at", new Date(`${sp.recall_to}T23:59:59`).toISOString());
    // ホームページ／MEO／SNS運用の有無は、契約状況の該当する商材の行で「有」チェックが
    // 入っているかどうかで判定する（商材名が入っているだけでは「有」にならない）
    if (sp.has_url === "yes") query = query.contains("contracts", [{ product: "HP", active: true }]);
    if (sp.has_url === "no") query = query.not("contracts", "cs", JSON.stringify([{ product: "HP", active: true }]));
    if (sp.has_meo === "yes") query = query.contains("contracts", [{ product: "MEO", active: true }]);
    if (sp.has_meo === "no") query = query.not("contracts", "cs", JSON.stringify([{ product: "MEO", active: true }]));
    if (sp.has_sns === "yes") query = query.contains("contracts", [{ product: "SNS運用", active: true }]);
    if (sp.has_sns === "no") query = query.not("contracts", "cs", JSON.stringify([{ product: "SNS運用", active: true }]));
    if (sp.acquisition_desire) query = query.eq("acquisition_desire", sp.acquisition_desire);
    if (callLeadIds !== null) {
      query = query.in("id", callLeadIds.length > 0 ? callLeadIds : ["00000000-0000-0000-0000-000000000000"]);
    }

    const { data, count, error } = await query;
    leads = (data as unknown as LeadRow[]) ?? [];
    total = count ?? 0;
    queryError = error;
  }

  // 実績パネル用：ステータス別の全体件数（絞り込み条件・検索実行の有無に関わらず常に表示）
  const { count: totalAll } = await supabase.from("leads").select("id", { count: "exact", head: true });
  const statusCounts = await Promise.all(
    visibleStatuses.map(async (status) => {
      const { count: c } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return { status, count: c ?? 0 };
    })
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function hrefFor(p: number) {
    const params = new URLSearchParams();
    if (hasSearched) params.set("searched", "1");
    if (sp.company) params.set("company", sp.company);
    if (sp.phone_prefix) params.set("phone_prefix", sp.phone_prefix);
    if (sp.rep) params.set("rep", sp.rep);
    if (sp.credit_company) params.set("credit_company", sp.credit_company);
    if (sp.status) params.set("status", sp.status);
    if (sp.assignee) params.set("assignee", sp.assignee);
    genreList.forEach((g) => params.append("genre", g));
    prefList.forEach((pr) => params.append("pref", pr));
    cmsList.forEach((c) => params.append("cms", c));
    if (sp.caller) params.set("caller", sp.caller);
    if (sp.call_result) params.set("call_result", sp.call_result);
    if (sp.call_rank) params.set("call_rank", sp.call_rank);
    if (sp.call_hot === "1") params.set("call_hot", "1");
    if (sp.recall_from) params.set("recall_from", sp.recall_from);
    if (sp.recall_to) params.set("recall_to", sp.recall_to);
    if (sp.has_url) params.set("has_url", sp.has_url);
    if (sp.has_meo) params.set("has_meo", sp.has_meo);
    if (sp.has_sns) params.set("has_sns", sp.has_sns);
    if (sp.acquisition_desire) params.set("acquisition_desire", sp.acquisition_desire);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/leads?${s}` : "/leads";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">リード一覧</h1>
          <p className="mt-0.5 text-sm text-slate-500">{(totalAll ?? 0).toLocaleString()} 件のリードが登録されています</p>
        </div>
        <Link href="/leads/new" className={btnPrimaryCls}>
          + 新規リード追加
        </Link>
      </div>

      {/* 実績パネル：全体のステータス別件数をひと目で確認できます（検索前でも常に表示） */}
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

      {/* 検索条件：検索ボタンを押すまでは、この下のリード一覧は表示されません */}
      <form className={`flex flex-col gap-3 ${cardCls} p-4`}>
        <input type="hidden" name="searched" value="1" />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <FilterGroup title="地域・業種">
            <MultiSelectFilter label="都道府県" name="pref" options={PREFECTURES} selected={prefList} />
            <MultiSelectFilter label="業種" name="genre" options={GENRES} selected={genreList} />
          </FilterGroup>

          <FilterGroup title="参照元リスト">
            <MultiSelectFilter label="参照元" name="cms" options={CMS_FILTER_OPTIONS} selected={cmsList} />
          </FilterGroup>

          <FilterGroup title="コール履歴">
            {canManage && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                コール者
                <select name="caller" defaultValue={sp.caller || ""} className={`w-40 ${inputCls}`}>
                  <option value="">未選択</option>
                  {roster.map((r) => (
                    <option key={r.id} value={r.id}>
                      {nameFor(r)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              結果
              <select name="call_result" defaultValue={sp.call_result || ""} className={`w-36 ${inputCls}`}>
                <option value="">未選択</option>
                {CALL_RESULT_FLAT_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              ランク
              <select name="call_rank" defaultValue={sp.call_rank || ""} className={`w-24 ${inputCls}`}>
                <option value="">未選択</option>
                {CALL_RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-rose-600">
              <input
                type="checkbox"
                name="call_hot"
                value="1"
                defaultChecked={sp.call_hot === "1"}
                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              激アツ!!
            </label>
          </FilterGroup>

          <FilterGroup title="次回アタック日">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              から
              <input type="date" name="recall_from" defaultValue={sp.recall_from} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              まで
              <input type="date" name="recall_to" defaultValue={sp.recall_to} className={inputCls} />
            </label>
          </FilterGroup>

          <FilterGroup title="顧客名・電話番号">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              顧客名（部分一致）
              <input type="text" name="company" defaultValue={sp.company} className={`w-48 ${inputCls}`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              電話番号（前方一致）
              <input type="text" name="phone_prefix" defaultValue={sp.phone_prefix} className={`w-40 ${inputCls}`} />
            </label>
          </FilterGroup>

          <FilterGroup title="代表者・信販会社">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              代表者（部分一致）
              <input type="text" name="rep" defaultValue={sp.rep} className={`w-40 ${inputCls}`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              信販会社（部分一致）
              <input type="text" name="credit_company" defaultValue={sp.credit_company} className={`w-40 ${inputCls}`} />
            </label>
          </FilterGroup>

          <FilterGroup title="ホームページ">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              ホームページ有無
              <select name="has_url" defaultValue={sp.has_url || ""} className={inputCls}>
                <option value="">未選択</option>
                <option value="yes">あり</option>
                <option value="no">なし</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              MEO有無
              <select name="has_meo" defaultValue={sp.has_meo || ""} className={inputCls}>
                <option value="">未選択</option>
                <option value="yes">あり</option>
                <option value="no">なし</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              SNS運用有無
              <select name="has_sns" defaultValue={sp.has_sns || ""} className={inputCls}>
                <option value="">未選択</option>
                <option value="yes">あり</option>
                <option value="no">なし</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              集客意欲
              <select name="acquisition_desire" defaultValue={sp.acquisition_desire || ""} className={inputCls}>
                <option value="">未選択</option>
                {ACQUISITION_DESIRE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {ACQUISITION_DESIRE_LABEL[o]}
                  </option>
                ))}
              </select>
            </label>
          </FilterGroup>

          <FilterGroup title="ステータス・担当">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              ステータス
              <select name="status" defaultValue={sp.status || ""} className={inputCls}>
                <option value="">すべて</option>
                {visibleStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
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
          </FilterGroup>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className={btnAccentCls}>
            検索
          </button>
          <Link href="/leads" className={btnSecondarySmCls}>
            リセット
          </Link>
        </div>
      </form>

      {!hasSearched && (
        <div className={`${cardCls} p-8 text-center text-sm text-slate-400`}>
          条件を指定して「検索」を押すと、ここにリード一覧が表示されます。
        </div>
      )}

      {hasSearched && queryError && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">読み込みエラー: {queryError.message}</p>
      )}

      {hasSearched && (
        <>
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
                {leads.length === 0 && !queryError && (
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
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              <Link
                href={hrefFor(1)}
                className={page <= 1 ? "pointer-events-none rounded-lg border border-slate-100 px-3 py-1 text-slate-300" : btnSecondarySmCls}
              >
                先頭
              </Link>
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
              <Link
                href={hrefFor(totalPages)}
                className={page >= totalPages ? "pointer-events-none rounded-lg border border-slate-100 px-3 py-1 text-slate-300" : btnSecondarySmCls}
              >
                末尾
              </Link>

              {/* 任意のページ番号へ直接移動する欄（現在の絞り込み条件は維持したまま移動します） */}
              <form action="/leads" method="get" className="flex items-center gap-1.5">
                <input type="hidden" name="searched" value="1" />
                {sp.company && <input type="hidden" name="company" value={sp.company} />}
                {sp.phone_prefix && <input type="hidden" name="phone_prefix" value={sp.phone_prefix} />}
                {sp.rep && <input type="hidden" name="rep" value={sp.rep} />}
                {sp.credit_company && <input type="hidden" name="credit_company" value={sp.credit_company} />}
                {sp.status && <input type="hidden" name="status" value={sp.status} />}
                {sp.assignee && <input type="hidden" name="assignee" value={sp.assignee} />}
                {genreList.map((g) => (
                  <input key={`h-genre-${g}`} type="hidden" name="genre" value={g} />
                ))}
                {prefList.map((pr) => (
                  <input key={`h-pref-${pr}`} type="hidden" name="pref" value={pr} />
                ))}
                {cmsList.map((c) => (
                  <input key={`h-cms-${c}`} type="hidden" name="cms" value={c} />
                ))}
                {sp.caller && <input type="hidden" name="caller" value={sp.caller} />}
                {sp.call_result && <input type="hidden" name="call_result" value={sp.call_result} />}
                {sp.call_rank && <input type="hidden" name="call_rank" value={sp.call_rank} />}
                {sp.call_hot === "1" && <input type="hidden" name="call_hot" value="1" />}
                {sp.recall_from && <input type="hidden" name="recall_from" value={sp.recall_from} />}
                {sp.recall_to && <input type="hidden" name="recall_to" value={sp.recall_to} />}
                {sp.has_url && <input type="hidden" name="has_url" value={sp.has_url} />}
                {sp.has_meo && <input type="hidden" name="has_meo" value={sp.has_meo} />}
                {sp.has_sns && <input type="hidden" name="has_sns" value={sp.has_sns} />}
                {sp.acquisition_desire && <input type="hidden" name="acquisition_desire" value={sp.acquisition_desire} />}
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  ページ指定
                  <input type="number" name="page" min={1} max={totalPages} defaultValue={page} className={`w-16 ${inputCls}`} />
                </label>
                <button type="submit" className={btnSecondarySmCls}>
                  移動
                </button>
              </form>
            </div>
          )}
        </>
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

// 検索条件をグループごとに枠で囲んで見やすくするための小さな箱
function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-xs font-bold text-slate-500">{title}</p>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
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
          className={`${inputCls} flex w-40 cursor-pointer select-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden`}
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
