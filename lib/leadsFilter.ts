// リード一覧の検索条件を、一覧画面と「リード詳細の前へ/次へ」の両方で
// 同じロジックとして使い回すための共通ヘルパー。
// ここを書き換えると、一覧の絞り込みと前へ/次への順序判定の両方に反映される。

import type { createClient } from "@/lib/supabase/server";

// このファイルの関数は、サーバー側で作った Supabase クライアント（createClient()の戻り値）を
// 受け取って使う。個別に型を書き下すのではなく、実際の戻り値の型をそのまま使い回す。
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type LeadSearchParams = {
  company?: string;
  phone_prefix?: string;
  rep?: string;
  credit_company?: string;
  status?: string;
  assignee?: string;
  genre?: string | string[];
  pref?: string | string[];
  cms?: string | string[];
  caller?: string;
  call_result?: string;
  call_rank?: string | string[];
  call_hot?: string;
  recall_from?: string;
  recall_to?: string;
  has_url?: string;
  has_meo?: string;
  has_sns?: string;
  acquisition_desire?: string;
};

export function toList(v?: string | string[]): string[] {
  return Array.isArray(v) ? v : v ? [v] : [];
}

// searchParams（文字列 or 文字列の配列が混ざったオブジェクト）を、そのままURLのクエリ文字列に変換する。
// リード一覧の「戻る」リンクや、行ごとのリンクに現在の絞り込み条件を引き継がせるために使う。
export function searchParamsToQueryString(sp: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else {
      params.set(key, value);
    }
  }
  return params.toString();
}

// コール履歴（コール者・結果・ランク・激アツ!!）による絞り込みは calls テーブル側の条件なので、
// 先に該当するリードIDを集めておく。該当条件が無ければ null（絞り込みなし）を返す。
export async function getCallFilteredLeadIds(
  supabase: SupabaseClient,
  sp: LeadSearchParams,
  callRankList: string[]
): Promise<string[] | null> {
  if (!sp.caller && !sp.call_result && callRankList.length === 0 && sp.call_hot !== "1") return null;
  let callsQuery = supabase.from("calls").select("lead_id");
  if (sp.caller) callsQuery = callsQuery.eq("caller_id", sp.caller);
  if (sp.call_result) callsQuery = callsQuery.eq("result", sp.call_result);
  if (callRankList.length > 0) callsQuery = callsQuery.in("rank", callRankList);
  if (sp.call_hot === "1") callsQuery = callsQuery.eq("hot", true);
  const { data: callRows } = await callsQuery;
  return Array.from(new Set(((callRows ?? []) as { lead_id: string }[]).map((r) => r.lead_id)));
}

// leads テーブルへのクエリに、検索条件をすべて適用する（.select()済みのクエリに対して使う）。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLeadFilters<Q extends { eq: any; ilike: any; in: any; gte: any; lte: any; contains: any; not: any }>(
  query: Q,
  sp: LeadSearchParams,
  genreList: string[],
  prefList: string[],
  cmsList: string[],
  callLeadIds: string[] | null
): Q {
  let q = query;
  if (sp.company && sp.company.trim()) {
    const c = sp.company.trim().replace(/[%,]/g, "");
    q = q.ilike("company", `%${c}%`);
  }
  if (sp.phone_prefix && sp.phone_prefix.trim()) {
    const p = sp.phone_prefix.trim().replace(/[%,]/g, "");
    q = q.ilike("phone", `${p}%`);
  }
  if (sp.rep && sp.rep.trim()) {
    const r = sp.rep.trim().replace(/[%,]/g, "");
    q = q.ilike("rep_name", `%${r}%`);
  }
  if (sp.credit_company && sp.credit_company.trim()) {
    // credit_company 列は元々「信販会社」用だったが、現在は「担当者名（顧客側）」として
    // 使っている（列名・パラメータ名は互換性のため変更していない）。
    const cc = sp.credit_company.trim().replace(/[%,]/g, "");
    q = q.ilike("credit_company", `%${cc}%`);
  }
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.assignee) q = q.eq("assigned_to", sp.assignee);
  if (genreList.length > 0) q = q.in("genre", genreList);
  if (prefList.length > 0) q = q.in("pref", prefList);
  if (cmsList.length > 0) q = q.in("cms", cmsList);
  if (sp.recall_from) q = q.gte("recall_at", new Date(`${sp.recall_from}T00:00:00`).toISOString());
  if (sp.recall_to) q = q.lte("recall_at", new Date(`${sp.recall_to}T23:59:59`).toISOString());
  // 注意：.contains() は第2引数がJSの配列だと「Postgresのネイティブ配列カラム」
  // 向けの書式（cs.{...}）に変換されてしまい、オブジェクトを含む配列を渡すと
  // 壊れたJSON文字列になってしまう（jsonbカラムであるcontractsには不正な値）。
  // 「なし」側（.not + JSON.stringify）と同じく、JSON文字列として渡す必要がある。
  if (sp.has_url === "yes") q = q.contains("contracts", JSON.stringify([{ product: "HP", active: true }]));
  if (sp.has_url === "no") q = q.not("contracts", "cs", JSON.stringify([{ product: "HP", active: true }]));
  if (sp.has_meo === "yes") q = q.contains("contracts", JSON.stringify([{ product: "MEO", active: true }]));
  if (sp.has_meo === "no") q = q.not("contracts", "cs", JSON.stringify([{ product: "MEO", active: true }]));
  if (sp.has_sns === "yes") q = q.contains("contracts", JSON.stringify([{ product: "SNS運用", active: true }]));
  if (sp.has_sns === "no") q = q.not("contracts", "cs", JSON.stringify([{ product: "SNS運用", active: true }]));
  if (sp.acquisition_desire) q = q.eq("acquisition_desire", sp.acquisition_desire);
  if (callLeadIds !== null) {
    q = q.in("id", callLeadIds.length > 0 ? callLeadIds : ["00000000-0000-0000-0000-000000000000"]);
  }
  return q;
}

// 現在の絞り込み条件のもとで、指定したリードの「前・次」のリードIDを求める。
export async function getAdjacentLeadIds(
  supabase: SupabaseClient,
  sp: LeadSearchParams,
  currentLeadId: string
): Promise<{ prevId: string | null; nextId: string | null; index: number; total: number } | null> {
  const genreList = toList(sp.genre);
  const prefList = toList(sp.pref);
  const cmsList = toList(sp.cms);
  const callRankList = toList(sp.call_rank);
  const callLeadIds = await getCallFilteredLeadIds(supabase, sp, callRankList);

  let query = supabase.from("leads").select("id").order("created_at", { ascending: false });
  query = applyLeadFilters(query, sp, genreList, prefList, cmsList, callLeadIds);

  const { data } = await query;
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const index = ids.indexOf(currentLeadId);
  if (index === -1) return null;
  return {
    prevId: index > 0 ? ids[index - 1] : null,
    nextId: index < ids.length - 1 ? ids[index + 1] : null,
    index,
    total: ids.length,
  };
}
