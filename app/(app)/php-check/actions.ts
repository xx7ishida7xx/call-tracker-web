"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, isGuestRole } from "@/lib/types";
import { checkSitePhp } from "@/lib/phpCheck";
import { PHP_STATUSES } from "@/lib/phpStatus";

const BATCH_SIZE = 20; // 1回の呼び出しで調べる件数
const CONCURRENCY = 10; // 同時に調べる件数

export type PhpBatchResult = {
  processed: number;
  remaining: number; // この後まだ調べる対象が何件残っているか
  cursor: string | null; // 「全件やり直し」のとき、次に続きから始めるための目印
  summary: Record<string, number>;
};

export type PhpOverview = { total: number; withUrl: number; unchecked: number; byStatus: Record<string, number> };

// 判定の状況（件数）
export async function getPhpOverview(): Promise<PhpOverview> {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) throw new Error("この操作は管理者のみ可能です。");
  const supabase = await createClient();
  const count = async (f: (q: ReturnType<typeof base>) => unknown) => {
    const q = f(base()) as PromiseLike<{ count: number | null }>;
    const r = await q;
    return r.count ?? 0;
  };
  function base() {
    return supabase.from("leads").select("id", { count: "exact", head: true });
  }
  const total = await count((q) => q);
  const withUrl = await count((q) => q.neq("url", ""));
  const unchecked = await count((q) => q.neq("url", "").is("php_checked_at", null));
  const byStatus: Record<string, number> = {};
  for (const s of PHP_STATUSES) byStatus[s] = await count((q) => q.eq("php_status", s));
  return { total, withUrl, unchecked, byStatus };
}

type Row = { id: string; url: string | null };

async function checkAndSave(rows: Row[], summary: Record<string, number>) {
  const admin = createAdminClient();
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const row = rows[i++];
      const r = await checkSitePhp(row.url ?? "");
      summary[r.status] = (summary[r.status] ?? 0) + 1;
      await admin
        .from("leads")
        .update({ php_version: r.version, php_status: r.status, php_note: r.note, php_checked_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
}

// まとめて判定する（管理者のみ）。
//   mode "unchecked" … まだ判定していない（URLがある）リードを順に
//   mode "all"       … 全件をやり直す（cursor より後のIDから順に）
//   mode "private"   … 「非公開」と判定済みのものだけを、WordPressの手がかりつきでやり直す
export async function runPhpCheckBatch(mode: "unchecked" | "all" | "private", cursor: string | null): Promise<PhpBatchResult> {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) throw new Error("この操作は管理者のみ可能です。");
  const supabase = await createClient();

  let q = supabase.from("leads").select("id,url").neq("url", "").order("id").limit(BATCH_SIZE);
  if (mode === "unchecked") q = q.is("php_checked_at", null);
  else {
    if (mode === "private") q = q.eq("php_status", "非公開");
    if (cursor) q = q.gt("id", cursor);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];

  const summary: Record<string, number> = {};
  await checkAndSave(rows, summary);

  let remQ = supabase.from("leads").select("id", { count: "exact", head: true }).neq("url", "");
  if (mode === "unchecked") remQ = remQ.is("php_checked_at", null);
  else {
    if (mode === "private") remQ = remQ.eq("php_status", "非公開");
    if (rows.length > 0) remQ = remQ.gt("id", rows[rows.length - 1].id);
  }
  const { count } = await remQ;
  // 判定済みのものだけが残る場合に無限ループしないよう、取得が0件なら残りも0とみなす
  const remaining = rows.length === 0 ? 0 : (count ?? 0);

  return { processed: rows.length, remaining, cursor: rows.length ? rows[rows.length - 1].id : cursor, summary };
}

// 1件のリードを、いますぐ判定する（ゲスト以外）
export async function checkLeadPhp(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getCurrentProfile();
  if (!me || isGuestRole(me.role)) return { ok: false, error: "この操作はできません。" };
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id,url").eq("id", leadId).maybeSingle();
  if (!lead) return { ok: false, error: "リードが見つかりません。" };
  if (!lead.url) return { ok: false, error: "URLが入っていないため判定できません。" };
  await checkAndSave([lead as Row], {});
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { ok: true };
}
