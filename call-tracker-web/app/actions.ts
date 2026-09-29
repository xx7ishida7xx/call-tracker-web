"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { parseLeadsCsv } from "@/lib/csv";
import type { Lead } from "@/lib/types";

// ---------------------------------------------------------------------------
// 認証
// ---------------------------------------------------------------------------
export type AuthState = { error?: string } | undefined;

export async function signIn(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "メールアドレスまたはパスワードが正しくありません。" };
  }
  redirect("/leads");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// リード
// ---------------------------------------------------------------------------
export async function updateLead(id: string, patch: Partial<Lead>) {
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
}

export async function addCall(
  leadId: string,
  payload: {
    result: string;
    notes: string;
    appointment: boolean;
    recall_at: string | null;
    recall_target: string | null;
    next_status: string;
  }
) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { error: callError } = await supabase.from("calls").insert({
    lead_id: leadId,
    caller_id: me.id,
    result: payload.result,
    notes: payload.notes,
    appointment: payload.appointment,
    recall_at: payload.recall_at,
    recall_target: payload.recall_target,
  });
  if (callError) throw new Error(callError.message);

  const { error: leadError } = await supabase
    .from("leads")
    .update({
      status: payload.next_status,
      last_call_at: new Date().toISOString(),
      last_call_staff: me.display_name || me.name || me.email,
      recall_at: payload.recall_at,
      recall_target: payload.recall_target,
    })
    .eq("id", leadId);
  if (leadError) throw new Error(leadError.message);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function createLead(patch: {
  company: string;
  pref: string;
  address: string;
  phone: string;
  email: string;
  url: string;
  cms: string;
  genre: string;
  subgenre: string;
  assigned_to: string | null;
}) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const assignedTo = me.role === "admin" || me.role === "teamlead" ? patch.assigned_to : me.id;

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...patch, assigned_to: assignedTo, status: "未着手" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/leads");
  redirect(`/leads/${data.id}`);
}

// ---------------------------------------------------------------------------
// メンバー管理（表示名 / ロール）
// ---------------------------------------------------------------------------
export async function updateProfile(
  id: string,
  patch: { display_name?: string | null; role?: string; team_lead_id?: string | null }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/members");
}

// ---------------------------------------------------------------------------
// CSV インポート
// ---------------------------------------------------------------------------
export async function importLeadsCsv(csvText: string, assignTo: string | null) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { rows, unmatchedHeaders } = parseLeadsCsv(csvText);
  if (rows.length === 0) {
    return { total: 0, imported: 0, skippedDuplicate: 0, unmatchedHeaders };
  }

  // 管理者・チームリーダー以外は自分自身にしか割り当てられない
  const effectiveAssignTo =
    me.role === "admin" || me.role === "teamlead" ? assignTo : me.id;

  // 電話番号での重複チェック（電話番号ありの行のみ対象）
  const phones = Array.from(new Set(rows.map((r) => r.phone).filter(Boolean)));
  let existingPhones = new Set<string>();
  if (phones.length > 0) {
    const { data: existing } = await supabase
      .from("leads")
      .select("phone")
      .in("phone", phones);
    existingPhones = new Set((existing ?? []).map((r) => r.phone).filter(Boolean));
  }

  const toInsert = rows
    .filter((r) => !(r.phone && existingPhones.has(r.phone)))
    .map((r) => ({
      company: r.company,
      pref: r.pref,
      address: r.address,
      phone: r.phone,
      email: r.email,
      url: r.url,
      cms: r.cms,
      genre: r.genre,
      subgenre: r.subgenre,
      status: "未着手",
      assigned_to: effectiveAssignTo,
    }));

  const CHUNK = 500;
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { error, count } = await supabase.from("leads").insert(chunk, { count: "exact" });
    if (error) throw new Error(error.message);
    imported += count ?? chunk.length;
  }

  revalidatePath("/leads");

  return {
    total: rows.length,
    imported,
    skippedDuplicate: rows.length - toInsert.length,
    unmatchedHeaders,
  };
}
