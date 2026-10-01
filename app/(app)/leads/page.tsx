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
import { applyLeadFilters, getCallFilteredLeadIds, type LeadSearchParams } from "@/lib/leadsFilter";
import AssigneeCell from "./AssigneeCell";
import MultiSelectFilter from "./MultiSelectFilter";
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

type SearchParams = LeadSearchParams & {
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

  // 業種・都道府県・参照元・ランクは複数選択できるようにしているため、常に配列として扱う
  const genreList = Array.isArray(sp.genre) ? sp.genre : sp.genre ? [sp.genre] : [];
  const prefList = Array.isArray(sp.pref) ? sp.pref : sp.pref ? [sp.pref] : [];
  const cmsList = Array.isArray(sp.cms) ? sp.cms : sp.cms ? [sp.cms] : [];
  const callRankList = Array.isArray(sp.call_rank) ? sp.call_rank : sp.call_rank ? [sp.call_rank] : [];

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
    // 先に該当するリードIDを集めてから leads を絞り込む（一覧・詳細の前へ/次へで共通のロジック）
    const callLeadIds = await getCallFilteredLeadIds(supabase, sp, callRankList);

    let query = supabase
      .from("leads")
      .select(
        "id,company,pref,phone,status,assigned_to,last_call_at,recall_at,created_at,assigned:profiles!leads_assigned_to_fkey(id,name,display_name,email)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);
    query = applyLeadFilters(query, sp, genreList, prefList, cmsList, callLeadIds);

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
    callRankList.forEach((r) => params.append("call_rank", r));
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

  // 一覧の行からリード詳細へ渡す、現在の絞り込み条件（詳細画面の「前へ／次へ／一覧へ戻る」で使う）
  const filterQS = hrefFor(page).split("?")[1] ?? "";
  const leadHref = (leadId: string) => (filterQS ? `/leads/${leadId}?${filterQS}` : `/leads/${leadId}`);

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
      {/* key に今のURLの検索条件を入れておくことで、「リセット」ボタン（/leadsへ、条件なしで移動）を
          押したときに、この検索条件欄一式をReactに作り直させる。
          keyを指定しないと、URLの条件が空に変わっても画面側の入力欄・複数選択欄
          （MultiSelectFilterの選択状態）は変わらないまま残ってしまい、
          「リセットを押しても上の条件欄が空にならない」という不具合になっていた。 */}
      <form key={JSON.stringify({ ...sp, page: undefined })} className={`flex flex-col gap-3 ${cardCls} p-4`}>
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
            <MultiSelectFilter label="ランク" name="call_rank" options={CALL_RANKS} selected={callRankList} />
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

          <FilterGroup title="代表者・担当者">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              代表者（部分一致）
              <input type="text" name="rep" defaultValue={sp.rep} className={`w-40 ${inputCls}`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              担当者（部分一致）
              <input type="text" name="credit_company" defaultValue={sp.credit_company} className={`w-40 ${inputCls}`} />
            </label>
          </FilterGroup>

          <FilterGroup title="既存契約">
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

          <FilterGroup title="やる気度">
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
                      <Link href={leadHref(lead.id)} className="font-medium text-slate-900 hover:text-orange-600 hover:underline">
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
                {callRankList.map((r) => (
                  <input key={`h-call_rank-${r}`} type="hidden" name="call_rank" value={r} />
                ))}
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

