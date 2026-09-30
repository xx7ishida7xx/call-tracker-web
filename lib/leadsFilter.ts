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
  prefList:
