"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { parseLeadsCsv } from "@/lib/csv";
import { canManageMembers, canManageProfileGoals, ATTACHMENT_CATEGORIES, MAX_ATTACHMENT_SIZE, type AttachmentCategory, type Lead, type Profile, type Role } from "@/lib/types";
import { holidayMapForMonth, defaultIsWorking, datesInMonth } from "@/lib/workday";

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
    result_group: string | null;
    notes: string;
    appointment: boolean;
    connected: boolean;
    recall_at: string | null;
    recall_target: string | null;
    next_status: string;
    rank: string | null;
    hot: boolean;
  }
) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { error: callError } = await supabase.from("calls").insert({
    lead_id: leadId,
    caller_id: me.id,
    result: payload.result,
    result_group: payload.result_group,
    notes: payload.notes,
    appointment: payload.appointment,
    connected: payload.connected,
    recall_at: payload.recall_at,
    recall_target: payload.recall_target,
    rank: payload.rank,
    hot: payload.hot,
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

// 通話記録の修正・削除(入力ミスをやり直せるように)。
// 編集・削除できるのは、その記録を登録した本人か、管理者・オーナーのみ
// (calls テーブルのRLSでも同じ条件を確認している)。
export async function updateCall(
  callId: string,
  payload: {
    result: string;
    result_group: string | null;
    notes: string;
    appointment: boolean;
    connected: boolean;
    recall_at: string | null;
    recall_target: string | null;
    rank: string | null;
    hot: boolean;
  }
) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { data: existing } = await supabase.from("calls").select("id, lead_id, caller_id").eq("id", callId).maybeSingle();
  if (!existing) throw new Error("通話記録が見つかりませんでした。");
  if (!(me.is_owner || me.role === "admin" || existing.caller_id === me.id)) {
    throw new Error("この通話記録を編集する権限がありません。");
  }

  const { error } = await supabase
    .from("calls")
    .update({
      result: payload.result,
      result_group: payload.result_group,
      notes: payload.notes,
      appointment: payload.appointment,
      connected: payload.connected,
      recall_at: payload.recall_at,
      recall_target: payload.recall_target,
      rank: payload.rank,
      hot: payload.hot,
    })
    .eq("id", callId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${existing.lead_id}`);
}

export async function deleteCall(callId: string) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { data: existing } = await supabase.from("calls").select("id, lead_id, caller_id").eq("id", callId).maybeSingle();
  if (!existing) throw new Error("通話記録が見つかりませんでした。");
  if (!(me.is_owner || me.role === "admin" || existing.caller_id === me.id)) {
    throw new Error("この通話記録を削除する権限がありません。");
  }

  const { error } = await supabase.from("calls").delete().eq("id", callId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${existing.lead_id}`);
}

// ------------------------------------------------------------------
