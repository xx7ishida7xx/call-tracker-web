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
  // 「担当者名あり」チェック（"1" のとき、担当者名（顧客側）が入力済みのリードだけに絞る）
  has_contact?: string;
  status?: string;
  assignee?: string;
  genre?: string | string[];
  pref?: string | string[];
  cms?: string | string[];
  hp_status?: string | string[];
  php_status?: string | string[];
  caller?: string;
  call_result?: string;
  call_rank?: string | string[];
  call_hot?: string;
  // 「直近の通話のみ」チェック（"1" のとき、リードごとの一番新しい通話だけを、コール履歴の条件の対象にする）
  call_latest?: string;
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
  const baseQuery = () => {
    let q = supabase.from("calls").select("id,lead_id");
    if (sp.caller) q = q.eq("caller_id", sp.caller);
    if (sp.call_result) q = q.eq("result", sp.call_result);
    if (callRankList.length > 0) q = q.in("rank", callRankList);
    if (sp.call_hot === "1") q = q.eq("hot", true);
    return q;
  };
  const { data: callRows } = await baseQuery();
  const rows = (callRows ?? []) as { id: string; lead_id: string }[];
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id)));

  // 「直近の通話のみ」：リードごとに一番新しい通話を求め、その通話が条件に合うリードだけを残す。
  // 例）結果＝再コール＋直近のみ → 「最後に記録した通話が再コール」のリードだけ。
  //     あとでコールアウトなどの結果が記録されたリードは外れる。
  if (sp.call_latest === "1" && leadIds.length > 0) {
    const matchedCallIds = new Set(rows.map((r) => r.id));
    const keep = new Set<string>();
    const CHUNK = 100;
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      const chunk = leadIds.slice(i, i + CHUNK);
      const { data: allCalls } = await supabase
        .from("calls")
        .select("id,lead_id")
        .in("lead_id", chunk)
        .order("called_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5000);
      const seen = new Set<string>();
      for (const c of (allCalls ?? []) as { id: string; lead_id: string }[]) {
        if (seen.has(c.lead_id)) continue; // 新しい順なので、最初に出てきたものがそのリードの直近の通話
        seen.add(c.lead_id);
        if (matchedCallIds.has(c.id)) keep.add(c.lead_id);
      }
    }
    return Array.from(keep);
  }
  return leadIds;
}

// leads テーブルへのクエリに、検索条件をすべて適用する（.select()済みのクエリに対して使う）。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLeadFilters<Q extends { eq: any; ilike: any; in: any; gte: any; lte: any; contains: any; not: any; or: any }>(
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
  // 「担当者名あり」チェック：担当者名（顧客側）が空でないリードだけを出す。
  // NULL と空文字の両方を「未入力」として除外する。
  if (sp.has_contact === "1") {
    q = q.not("credit_company", "is", null).not("credit_company", "eq", "");
  }
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.assignee) q = q.eq("assigned_to", sp.assignee);
  if (genreList.length > 0) q = q.in("genre", genreList);
  if (prefList.length > 0) q = q.in("pref", prefList);
  if (cmsList.length > 0) q = q.in("cms", cmsList);
  // HPの状態（選択式・複数選択）。選んだもののどれかに当てはまるリードを出す。
  const hpStatusList = toList(sp.hp_status);
  if (hpStatusList.length > 0) q = q.in("hp_status", hpStatusList);
  // PHP判定（複数選択）。「未判定」は php_status が空のリード。
  const phpList = toList(sp.php_status);
  if (phpList.length > 0) {
    const real = phpList.filter((s) => s !== "未判定");
    const unchecked = phpList.includes("未判定");
    if (real.length > 0 && unchecked) {
      q = q.or(`php_status.in.(${real.map((s) => `"${s}"`).join(",")}),php_status.eq.`);
    } else if (real.length > 0) {
      q = q.in("php_status", real);
    } else {
      q = q.eq("php_status", "");
    }
  }
  if (sp.recall_from) q = q.gte("recall_at", new Date(`${sp.recall_from}T00:00:00+09:00`).toISOString());
  if (sp.recall_to) q = q.lte("recall_at", new Date(`${sp.recall_to}T23:59:59+09:00`).toISOString());
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

// 指定したリードが絞り込み条件から外れている場合に、一覧の並び順（created_at降順 → id降順）上の
// 位置を基準に、条件に合う「前・次」のリードIDを求める。
// 一覧の中での何番目か（index/total）は求めないため、-1 と 0 を返す（画面では前後のIDしか使っていない）。
async function getAdjacentLeadIdsByPosition(
  supabase: SupabaseClient,
  sp: LeadSearchParams,
  currentLeadId: string,
  genreList: string[],
  prefList: string[],
  cmsList: string[],
  callLeadIds: string[] | null
): Promise<{ prevId: string | null; nextId: string | null; index: number; total: number } | null> {
  const { data: cur } = await supabase
    .from("leads")
    .select("id,created_at")
    .eq("id", currentLeadId)
    .maybeSingle();
  if (!cur) return null;
  const c = (cur as { id: string; created_at: string }).created_at;

  // 次へ：並び順（新しい順）で、今のリードより後ろにある、条件に合う最初の1件
  let nextQuery = supabase
    .from("leads")
    .select("id")
    .or(`created_at.lt.${c},and(created_at.eq.${c},id.lt.${currentLeadId})`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  nextQuery = applyLeadFilters(nextQuery, sp, genreList, prefList, cmsList, callLeadIds);

  // 前へ：並び順（新しい順）で、今のリードより前にある、条件に合う最後の1件
  let prevQuery = supabase
    .from("leads")
    .select("id")
    .or(`created_at.gt.${c},and(created_at.eq.${c},id.gt.${currentLeadId})`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  prevQuery = applyLeadFilters(prevQuery, sp, genreList, prefList, cmsList, callLeadIds);

  const [{ data: nextRows }, { data: prevRows }] = await Promise.all([nextQuery, prevQuery]);
  const nextId = ((nextRows ?? []) as { id: string }[])[0]?.id ?? null;
  const prevId = ((prevRows ?? []) as { id: string }[])[0]?.id ?? null;
  return { prevId, nextId, index: -1, total: 0 };
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

  let query = supabase.from("leads").select("id")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }); // 一覧と同じ並び順（同じ登録日時の並びを固定）
  query = applyLeadFilters(query, sp, genreList, prefList, cmsList, callLeadIds);

  const { data } = await query;
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const index = ids.indexOf(currentLeadId);
  if (index === -1) {
    // 今開いているリードが、絞り込み条件に当てはまらなくなっている場合の処理。
    // 例：「見込み」で絞り込んだ一覧から開いて通話を記録すると、ステータスが変わって
    //     条件から外れる（担当者や通話履歴の条件でも同じことが起きる）。
    //     以前はここで「前後なし」を返していたため、「次へ」が押せなくなっていた。
    //     そこで、一覧と同じ並び順（登録日時の新しい順 → ID降順）の中での今のリードの位置を基準に、
    //     条件に合う直前・直後のリードを探す。
    return getAdjacentLeadIdsByPosition(supabase, sp, currentLeadId, genreList, prefList, cmsList, callLeadIds);
  }
  return {
    prevId: index > 0 ? ids[index - 1] : null,
    nextId: index < ids.length - 1 ? ids[index + 1] : null,
    index,
    total: ids.length,
  };
}
