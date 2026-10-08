"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { parseLeadsCsv } from "@/lib/csv";
import { APO_KIN_STATUS, canManageMembers, canManageProfileGoals, ATTACHMENT_CATEGORIES, MAX_ATTACHMENT_SIZE, type AttachmentCategory, type Lead, type Profile, type Role } from "@/lib/types";
import { holidayMapForMonth, defaultIsWorking, datesInMonth } from "@/lib/workday";

// ---------------------------------------------------------------------------
// 認証
// ---------------------------------------------------------------------------
export type AuthState = { error?: string } | undefined;

export async function signIn(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  // Cloudflare Turnstile（CAPTCHA）のトークン。NEXT_PUBLIC_TURNSTILE_SITE_KEY が
  // 未設定の間はログイン画面にCAPTCHA自体が表示されないため、常に空文字になる。
  const captchaToken = String(formData.get("captchaToken") || "") || undefined;
  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });
  if (error) {
    if (error.message.toLowerCase().includes("captcha")) {
      return { error: "ボット確認の読み込みに時間がかかっています。少し待ってから、もう一度お試しください。" };
    }
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

  // この通話を記録する直前のリードのステータスを控えておく。あとでこの通話記録を
  // 削除したときに、ステータスを「この通話を記録する前」の状態に自動で戻すために使う
  // （calls.status_before / status_after。migration 0024）。
  // あわせて、担当者が「未割当」かどうかも控える。未割当なら、通話を記録した本人を
  // 担当者に自動で割り振る（すでに担当者がいるリードは変えない。migration 0025）。
  const { data: leadBefore } = await supabase
    .from("leads")
    .select("status, assigned_to")
    .eq("id", leadId)
    .maybeSingle();
  const autoAssign = !!leadBefore && !leadBefore.assigned_to;

  // アポの成績が付く人。通常は通話した本人。
  // 前確待ちのリードを、前確した人が「アポ確定」にした場合は、前確依頼をした人（アポを取った人）の成績にする。
  // 担当者（leads.assigned_to）は変えないので、担当者もそのまま。
  let appointmentCreditTo: string = me.id;
  if (payload.appointment && leadBefore?.status === "前確待ち") {
    const { data: requestCall } = await supabase
      .from("calls")
      .select("caller_id")
      .eq("lead_id", leadId)
      .eq("result", "前確依頼")
      .order("called_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    appointmentCreditTo = requestCall?.caller_id ?? leadBefore.assigned_to ?? me.id;
  }

  const { error: callError } = await supabase.from("calls").insert({
    lead_id: leadId,
    caller_id: me.id,
    assigned_by_call: autoAssign,
    status_before: leadBefore?.status ?? null,
    status_after: payload.next_status,
    result: payload.result,
    result_group: payload.result_group,
    notes: payload.notes,
    appointment: payload.appointment,
    appointment_credit_to: appointmentCreditTo,
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
      ...(autoAssign ? { assigned_to: me.id } : {}),
    })
    .eq("id", leadId);
  if (leadError) throw new Error(leadError.message);

  // 「アポ禁」にしたリードは、オーナー・管理者以外には見えなくなる（RLS）。
  // 開いている詳細ページを再取得すると「見つかりません」画面になってしまうため、
  // アポ禁にした場合は詳細ページの再取得は行わず（画面側で一覧／次のリードへ移動する）、
  // 一覧だけ更新する。
  if (payload.next_status !== APO_KIN_STATUS) {
    revalidatePath(`/leads/${leadId}`);
  }
  revalidatePath("/leads");
  // 画面側（開いているリード詳細の担当者欄）を、再読み込みなしで更新できるよう、
  // 自動で割り振った担当者を返す（割り振らなかった場合は null）。
  return { assignedTo: autoAssign ? me.id : null };
}

// 通話記録を編集・削除したあと、リード側のサマリー項目（最終架電日時・最終架電者・
// 次回架電予定）を、実際に残っている通話履歴の中で一番新しいものに合わせて
// 再計算する。
//
// addCall は通話記録を1件追加するたびにこれらの項目を更新しているが、通話記録を
// 削除（deleteCall）しても、この追加時に設定された値はそのまま残ってしまい、
// 「リード一覧には最終架電日が表示されているのに、リード詳細の通話履歴には
// 何も表示されない（編集も削除もできない＝そもそも記録が存在しない）」という
// 不整合が発生していた（2026-10-02 にヒロさんから報告・確認）。
// 通話記録を編集（updateCall）した場合も、その記録が最新の通話だった場合は
// 同様にズレるため、あわせて呼び出している。
async function syncLeadFromLatestCall(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string) {
  const { data: latest } = await supabase
    .from("calls")
    .select("called_at, recall_at, recall_target, caller:profiles!calls_caller_id_fkey(name,display_name,email)")
    .eq("lead_id", leadId)
    .order("called_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const callerProfile = latest
    ? ((Array.isArray(latest.caller) ? latest.caller[0] : latest.caller) as
        | { name: string | null; display_name: string | null; email: string | null }
        | null)
    : null;

  const { error } = await supabase
    .from("leads")
    .update({
      last_call_at: latest?.called_at ?? null,
      last_call_staff: callerProfile ? callerProfile.display_name || callerProfile.name || callerProfile.email : null,
      recall_at: latest?.recall_at ?? null,
      recall_target: latest?.recall_target ?? null,
    })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}

// 通話記録の修正・削除（入力ミスをやり直せるように）。
// 編集・削除できるのは、その記録を登録した本人か、管理者・オーナーのみ
// （calls テーブルのRLSでも同じ条件を確認している）。
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

  await syncLeadFromLatestCall(supabase, existing.lead_id);

  revalidatePath(`/leads/${existing.lead_id}`);
}

export async function deleteCall(callId: string) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { data: existing } = await supabase
    .from("calls")
    .select("id, lead_id, caller_id, called_at, status_before, status_after, assigned_by_call")
    .eq("id", callId)
    .maybeSingle();
  if (!existing) throw new Error("通話記録が見つかりませんでした。");
  if (!(me.is_owner || me.role === "admin" || existing.caller_id === me.id)) {
    throw new Error("この通話記録を削除する権限がありません。");
  }

  // 削除する通話が、そのリードの「一番新しい通話」かどうか（削除前に調べる）。
  // 古い通話を削除した場合は、ステータスは触らない。
  const { count: newerCount } = await supabase
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", existing.lead_id)
    .gt("called_at", existing.called_at);
  const wasLatest = (newerCount ?? 0) === 0;

  const { error } = await supabase.from("calls").delete().eq("id", callId);
  if (error) throw new Error(error.message);

  await syncLeadFromLatestCall(supabase, existing.lead_id);

  // ステータスの自動復元：一番新しい通話を削除した場合に、リードのステータスを
  // 「その通話を記録する前」の状態に戻す。ただし、通話を記録したあとにステータスを
  // 手動で変更していた場合（今のステータスが、その通話が設定した値と違う場合）は、
  // 手動の変更を尊重して何もしない。migration 0024 より前の通話記録
  // （status_before / status_after が空）も何もしない。
  let restoredStatus: string | null = null;
  if (wasLatest && existing.status_before && existing.status_after) {
    const { data: leadNow } = await supabase.from("leads").select("status").eq("id", existing.lead_id).maybeSingle();
    if (leadNow && leadNow.status === existing.status_after && leadNow.status !== existing.status_before) {
      const { error: restoreError } = await supabase
        .from("leads")
        .update({ status: existing.status_before })
        .eq("id", existing.lead_id);
      if (restoreError) throw new Error(restoreError.message);
      restoredStatus = existing.status_before;
    }
  }

  // 担当者の自動復元：この通話の記録によって担当者が自動で割り振られていて、
  // そのリードに通話記録が1件も残らず、担当者がまだ記録者本人のままの場合は、
  // 「未割当」に戻す（他の人に変更済みの場合は何もしない）。権限などで戻せなくても、
  // 通話記録の削除自体は成功させたいので、失敗してもエラーにはしない。
  let unassigned = false;
  if (existing.assigned_by_call) {
    const { count: remaining } = await supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", existing.lead_id);
    if ((remaining ?? 0) === 0) {
      const { data: leadAssign } = await supabase
        .from("leads")
        .select("assigned_to")
        .eq("id", existing.lead_id)
        .maybeSingle();
      if (leadAssign && leadAssign.assigned_to === existing.caller_id) {
        const { error: unassignError } = await supabase
          .from("leads")
          .update({ assigned_to: null })
          .eq("id", existing.lead_id);
        unassigned = !unassignError;
      }
    }
  }

  revalidatePath(`/leads/${existing.lead_id}`);
  revalidatePath("/leads");
  // 画面側（開いているリード詳細のステータス欄・担当者欄）を、再読み込みなしで更新できるよう、
  // 自動で戻したステータス・担当者を返す（戻さなかった場合は null / false）。
  return { restoredStatus, unassigned };
}

// ---------------------------------------------------------------------------
// リードへのファイル添付（診断レポート／アポ表）
//   実ファイルは Supabase Storage の lead-attachments バケット（非公開）に保存し、
//   lead_attachments テーブルにはメタ情報だけを持つ。ダウンロードは署名付きURL経由。
// ---------------------------------------------------------------------------
const ATTACHMENT_BUCKET = "lead-attachments";

// Supabase Storageの保存先パス（キー）は、日本語などの非ASCII文字を含むと
// 「Invalid key」エラーで保存できない（Storage側の制限）。
// そのため、保存先のパスには拡張子だけを安全な形で残し、ファイル名そのものは使わない。
// 元のファイル名（日本語含む）は lead_attachments.file_name 列に別途保存し、
// 画面上の表示・ダウンロードリンクのテキストにはそちらを使う。
function safeAttachmentExtension(name: string): string {
  const m = /\.([a-zA-Z0-9]{1,10})$/.exec(name);
  return m ? `.${m[1].toLowerCase()}` : "";
}

export async function addLeadAttachment(leadId: string, formData: FormData) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const category = String(formData.get("category") || "");
  if (!(ATTACHMENT_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error("添付ファイルの区分が正しくありません。");
  }
  const note = String(formData.get("note") || "").trim();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("ファイルを選択してください。");
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error("ファイルサイズが大きすぎます（25MBまでです）。");
  }

  const path = `${leadId}/${crypto.randomUUID()}${safeAttachmentExtension(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await supabase.from("lead_attachments").insert({
    lead_id: leadId,
    category: category as AttachmentCategory,
    file_path: path,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type || "",
    note,
    uploaded_by: me.id,
  });
  if (insertError) {
    // テーブルへの登録に失敗した場合、アップロード済みのファイルだけが残らないようにする
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw new Error(insertError.message);
  }

  revalidatePath(`/leads/${leadId}`);
}

export async function deleteLeadAttachment(attachmentId: string, leadId: string) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  // delete() に .select() を続けることで「実際に削除できた行」を受け取れる。
  // RLS（本人 or 管理者のみ削除可）に該当しない場合は0件のまま静かに終わるだけなので、
  // 0件だったら権限エラーとして扱う（Storage側のファイルも消さない）。
  const { data: deletedRows, error: deleteRowError } = await supabase
    .from("lead_attachments")
    .delete()
    .eq("id", attachmentId)
    .select("file_path");
  if (deleteRowError) throw new Error(deleteRowError.message);
  if (!deletedRows || deletedRows.length === 0) {
    throw new Error("このファイルを削除する権限がありません（アップロード本人か管理者のみ削除できます）。");
  }

  await supabase.storage.from(ATTACHMENT_BUCKET).remove([deletedRows[0].file_path]);

  revalidatePath(`/leads/${leadId}`);
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
  patch: { display_name?: string | null; role?: string; team_lead_id?: string | null; org_name?: string | null }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/members");
}

// ---------------------------------------------------------------------------
// メンバー招待
//   Supabaseの招待メール（Magic Link）を送り、相手がリンクからパスワードを
//   設定するとログインできるようになる。Service Role Key が必要な操作なので、
//   専用の管理者クライアント（RLSを経由しない）を使い、この関数自身で権限確認を行う。
// ---------------------------------------------------------------------------
export async function inviteMember(email: string, role: Role, companyName: string | null) {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) {
    throw new Error("メンバーを招待する権限がありません。");
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("正しいメールアドレスを入力してください。");
  }

  // オーナー以外の管理者は、管理者権限を持つメンバーを新しく作ることはできない
  // （メンバー管理画面でのロール変更と同じ制限を、招待時にもかけている）
  if (role === "admin" && !me.is_owner) {
    throw new Error("管理者権限の付与はオーナーのみが行えます。");
  }

  const h = await headers();
  const host = h.get("host");
  const origin = host ? `https://${host}` : undefined;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(cleanEmail, {
    redirectTo: origin ? `${origin}/auth/confirm?next=/set-password` : undefined,
  });

  if (error) {
    if (/already/i.test(error.message)) {
      throw new Error("このメールアドレスはすでに登録されています。");
    }
    throw new Error(error.message);
  }

  // 新しく作られたプロフィールに、指定したロール・所属会社を反映する
  // （自動作成時点では初期値の「staff」・会社未設定になっているため）
  const newUserId = data.user?.id;
  const cleanCompanyName = companyName?.trim() || null;
  if (newUserId) {
    const patch: { role?: Role; org_name?: string | null } = {};
    if (role !== "staff") patch.role = role;
    if (cleanCompanyName) patch.org_name = cleanCompanyName;
    if (Object.keys(patch).length > 0) {
      await admin.from("profiles").update(patch).eq("id", newUserId);
    }
  }

  revalidatePath("/members");
  return { email: cleanEmail };
}

// ---------------------------------------------------------------------------
// 会社マスタ（一覧管理）
//   ミライアゴーゴー自身・各ゲスト会社をこの一覧で登録・管理する。
//   招待画面・メンバー編集画面の「所属会社」は、この一覧から選ぶ。
// ---------------------------------------------------------------------------
export async function createCompany(name: string, displayName?: string | null, canViewAllLeads?: boolean) {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) {
    throw new Error("会社を登録する権限がありません。");
  }
  const cleanName = name.trim();
  if (!cleanName) throw new Error("会社名を入力してください。");
  const cleanDisplayName = displayName?.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({ name: cleanName, display_name: cleanDisplayName, can_view_all_leads: canViewAllLeads ?? false })
    .select("id, name, display_name, can_view_all_leads")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("同じ名前の会社がすでに登録されています。");
    }
    throw new Error(error.message);
  }
  revalidatePath("/members");
  return {
    id: data.id as string,
    name: data.name as string,
    display_name: data.display_name as string | null,
    can_view_all_leads: data.can_view_all_leads as boolean,
  };
}

export async function renameCompany(
  id: string,
  name: string,
  displayName?: string | null,
  canViewAllLeads?: boolean
) {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) {
    throw new Error("会社名を変更する権限がありません。");
  }
  const cleanName = name.trim();
  if (!cleanName) throw new Error("会社名を入力してください。");
  const cleanDisplayName = displayName?.trim() || null;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("companies").select("name").eq("id", id).maybeSingle();
  if (!existing) throw new Error("会社が見つかりませんでした。");

  const { error } = await supabase
    .from("companies")
    .update({ name: cleanName, display_name: cleanDisplayName, can_view_all_leads: canViewAllLeads ?? false })
    .eq("id", id);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("同じ名前の会社がすでに登録されています。");
    }
    throw new Error(error.message);
  }

  // 所属メンバーの org_name（文字列で持っている）も、新しい正式名称に合わせて更新する
  // （表示名称はプロフィール側には保持しておらず、照合時に companies テーブルから都度引く）
  if (existing.name !== cleanName) {
    await supabase.from("profiles").update({ org_name: cleanName }).eq("org_name", existing.name);
  }

  revalidatePath("/members");
  revalidatePath("/goals");
}

export async function deleteCompany(id: string) {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) {
    throw new Error("会社を削除する権限がありません。");
  }
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name, is_home").eq("id", id).maybeSingle();
  if (!company) throw new Error("会社が見つかりませんでした。");
  if (company.is_home) throw new Error("自社（ミライアゴーゴー）は削除できません。");

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("org_name", company.name);
  if ((count ?? 0) > 0) {
    throw new Error("この会社に所属しているメンバーがいるため削除できません。先にメンバーの所属会社を変更してください。");
  }

  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/members");
}

// ---------------------------------------------------------------------------
// パスワード再設定
//   Supabase標準の「パスワード再設定メール」を送るだけで、新しいパスワードが
//   何になるかはこのアプリのどこにも残らない（本人だけがメール経由で設定する）。
//   ・requestPasswordReset：ログイン画面から本人が申請する場合（CAPTCHA対応）
//   ・sendMemberPasswordReset：メンバー管理画面からオーナー・管理者が代理で送る場合。
//     画面上にCAPTCHAが無いため、Supabase標準の resetPasswordForEmail
//     （CAPTCHA必須）は使えない。代わりにAdmin API（generateLink、CAPTCHA対象外）で
//     再設定リンクだけを発行し、そのリンクをResend（メール配信サービス）経由で
//     自動送信する（2026-10-02 Resend導入）。
// ---------------------------------------------------------------------------
async function sendResetEmail(email: string, captchaToken?: string) {
  const h = await headers();
  const host = h.get("host");
  const origin = host ? `https://${host}` : undefined;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin ? `${origin}/auth/confirm?next=/set-password` : undefined,
    captchaToken,
  });
  if (error) throw new Error(error.message);
}

export async function requestPasswordReset(email: string, captchaToken?: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("正しいメールアドレスを入力してください。");
  }
  // 登録の有無にかかわらず同じ結果を返す（メールアドレスの存在有無を外部に漏らさないため）
  await sendResetEmail(cleanEmail, captchaToken);
}

// Resend（https://resend.com）のAPIを直接呼び出してメールを送る。
// npmパッケージは使わず fetch だけで呼ぶ（このプロジェクトはGitHub Web UIでの
// 手動アップロード運用のため、依存パッケージの追加はできるだけ避けたい）。
async function sendResendEmail(params: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error(
      "メール自動送信の設定が完了していません（Vercelの環境変数 RESEND_API_KEY / RESEND_FROM_EMAIL を確認してください）。"
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`メールの送信に失敗しました（${res.status}）。${body}`.trim());
  }
}

export async function sendMemberPasswordReset(memberId: string) {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) {
    throw new Error("パスワード再設定メールを送る権限がありません。");
  }
  const supabase = await createClient();
  const { data: target, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!target) throw new Error("メンバーが見つかりませんでした。");

  const h = await headers();
  const host = h.get("host");
  const origin = host ? `https://${host}` : undefined;

  // CAPTCHA保護の対象外である Admin API（generateLink）で、再設定リンクだけを発行する
  // （Supabase標準のメール送信機能は使わず、リンクの送信は下のResend経由で行う）。
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: target.email,
    options: {
      redirectTo: origin ? `${origin}/auth/confirm?next=/set-password` : undefined,
    },
  });
  if (linkError) throw new Error(linkError.message);
  const actionLink = linkData?.properties?.action_link;
  if (!actionLink) throw new Error("再設定用リンクの発行に失敗しました。");

  await sendResendEmail({
    to: target.email,
    subject: "【SamuraiONコールトラッカー】パスワード再設定のご案内",
    html: `
      <div style="font-family: sans-serif; line-height: 1.7; color: #1e293b;">
        <p>いつもSamuraiONコールトラッカーをご利用いただきありがとうございます。</p>
        <p>管理者よりパスワード再設定のご案内が届いています。下記のリンクから新しいパスワードを設定してください。</p>
        <p><a href="${actionLink}" style="color:#ea580c;">${actionLink}</a></p>
        <p>このメールに心当たりがない場合は、このまま破棄していただいて問題ありません。</p>
      </div>
    `,
    text: `いつもSamuraiONコールトラッカーをご利用いただきありがとうございます。\n\n管理者よりパスワード再設定のご案内が届いています。下記のリンクから新しいパスワードを設定してください。\n\n${actionLink}\n\nこのメールに心当たりがない場合は、このまま破棄していただいて問題ありません。`,
  });

  return { email: target.email };
}

// ---------------------------------------------------------------------------
// メンバー削除
//   auth.users を削除すると、profiles は on delete cascade で自動的に削除される。
//   Service Role Key が必要な操作なので、専用の管理者クライアントを使い、
//   この関数自身で権限確認を行う。
// ---------------------------------------------------------------------------
export async function deleteMember(memberId: string) {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) {
    throw new Error("メンバーを削除する権限がありません。");
  }
  if (me.id === memberId) {
    throw new Error("自分自身を削除することはできません。");
  }

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();
  if (targetError) throw new Error(targetError.message);
  if (!target) throw new Error("メンバーが見つかりませんでした。");
  if (target.is_owner) {
    throw new Error("オーナーを削除することはできません。");
  }
  // オーナー以外の管理者は、管理者権限を持つメンバーを削除できない
  // （メンバー管理画面でのロール変更・招待と同じ制限）
  if (!me.is_owner && target.role === "admin") {
    throw new Error("管理者の削除はオーナーのみが行えます。");
  }

  const { error } = await admin.auth.admin.deleteUser(memberId);
  if (error) throw new Error(error.message);

  revalidatePath("/members");
}

// ---------------------------------------------------------------------------
// CSV インポート・更新インポート・エクスポート共通のヘルパー
// ---------------------------------------------------------------------------
function normalizeAssigneeText(s: string): string {
  return s.trim().toLowerCase().replace(/　/g, " ");
}

type AssigneeLookup = {
  byPersonKey: Map<string, string>; // 正規化した名前・表示名・メール -> profile id
  guestAdminByCompanyKey: Map<string, string>; // 正規化した会社名（正式名称・表示名称どちらも） -> ゲスト管理者の profile id
};

// CSVの「担当者」欄（個人名 または ゲスト会社名）を突き合わせるための一覧を作る。
// 個人名に一致すればその人へ、会社名に一致すればその会社のゲスト管理者へ割り当てる。
async function buildAssigneeLookup(supabase: Awaited<ReturnType<typeof createClient>>): Promise<AssigneeLookup> {
  const byPersonKey = new Map<string, string>();
  const guestAdminByCompanyKey = new Map<string, string>();

  const { data: rosterData } = await supabase
    .from("profiles")
    .select("id, name, display_name, email, role, org_name");
  const roster =
    (rosterData as { id: string; name: string | null; display_name: string | null; email: string; role: Role; org_name: string | null }[]) ??
    [];
  // 会社ごとの表示名称（略称）も、正式名称（profiles.org_name に入っている文字列）と
  // あわせて照合できるように、会社マスタを正式名称 -> 表示名称のマップにしておく
  const { data: companiesData } = await supabase.from("companies").select("name, display_name");
  const displayNameByCompanyName = new Map<string, string>();
  for (const c of (companiesData as { name: string; display_name: string | null }[]) ?? []) {
    if (c.display_name && c.display_name.trim()) displayNameByCompanyName.set(c.name, c.display_name);
  }
  for (const p of roster) {
    for (const candidate of [p.display_name, p.name, p.email]) {
      if (candidate && candidate.trim()) byPersonKey.set(normalizeAssigneeText(candidate), p.id);
    }
    if (p.role === "guest_admin" && p.org_name && p.org_name.trim()) {
      const key = normalizeAssigneeText(p.org_name);
      if (!guestAdminByCompanyKey.has(key)) guestAdminByCompanyKey.set(key, p.id);
      const displayName = displayNameByCompanyName.get(p.org_name);
      if (displayName) {
        const displayKey = normalizeAssigneeText(displayName);
        if (!guestAdminByCompanyKey.has(displayKey)) guestAdminByCompanyKey.set(displayKey, p.id);
      }
    }
  }
  return { byPersonKey, guestAdminByCompanyKey };
}

// 「担当者」欄の1つの値を、個人 → 会社（ゲスト管理者） の順で突き合わせる。
// 一致しなければ null（＝一致なし）を返すだけで、一致しなかった場合に何を
// 割り当てるか（未割当のままにする／今までの担当者のままにする、など）は
// 呼び出し側（インポート／更新インポート）がそれぞれ判断する。
function resolveAssigneeMatch(
  raw: string,
  lookup: AssigneeLookup
): { id: string; via: "person" | "company" } | null {
  const value = raw.trim();
  if (!value) return null;
  const key = normalizeAssigneeText(value);
  const personId = lookup.byPersonKey.get(key);
  if (personId) return { id: personId, via: "person" };
  const companyAdminId = lookup.guestAdminByCompanyKey.get(key);
  if (companyAdminId) return { id: companyAdminId, via: "company" };
  return null;
}

export async function importLeadsCsv(csvText: string, assignTo: string | null) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { rows: parsedRows, unmatchedHeaders } = parseLeadsCsv(csvText);
  // 取り込みの原則：会社名・電話番号・住所の3つがそろっていない行は「リスト」ではないので取り込まない。
  //   （補完前のデータが誤って入るのを防ぐ。1行につき最初に当てはまる理由で数える）
  const skippedNoPhone = parsedRows.filter((r) => !r.phone.trim()).length;
  const skippedNoCompany = parsedRows.filter((r) => r.phone.trim() && !r.company.trim()).length;
  const skippedNoAddress = parsedRows.filter(
    (r) => r.phone.trim() && r.company.trim() && !r.address.trim()
  ).length;
  const rows = parsedRows.filter((r) => r.phone.trim() && r.company.trim() && r.address.trim());
  if (rows.length === 0) {
    return {
      total: parsedRows.length,
      imported: 0,
      skippedDuplicate: 0,
      skippedNoPhone,
      skippedNoCompany,
      skippedNoAddress,
      unmatchedHeaders,
      assignedByPerson: 0,
      assignedByCompany: 0,
      unmatchedAssignees: [] as string[],
    };
  }

  // 管理者・チームリーダー以外は自分自身にしか割り当てられない
  const effectiveAssignTo =
    me.role === "admin" || me.role === "teamlead" ? assignTo : me.id;

  const needsAssigneeLookup =
    (me.role === "admin" || me.role === "teamlead") && rows.some((r) => r.assignee.trim() !== "");
  const lookup: AssigneeLookup = needsAssigneeLookup
    ? await buildAssigneeLookup(supabase)
    : { byPersonKey: new Map(), guestAdminByCompanyKey: new Map() };

  let assignedByPerson = 0;
  let assignedByCompany = 0;
  const unmatchedAssigneesSet = new Set<string>();

  function resolveAssignee(raw: string): string | null {
    const value = raw.trim();
    if (!value) return effectiveAssignTo;
    const match = resolveAssigneeMatch(value, lookup);
    if (match) {
      if (match.via === "person") assignedByPerson += 1;
      else assignedByCompany += 1;
      return match.id;
    }
    unmatchedAssigneesSet.add(value);
    return effectiveAssignTo;
  }

  // 電話番号での重複チェック（既存に同じ電話番号があれば取り込まない）
  // ※電話番号を一度に大量（千件超）指定すると、問い合わせが長すぎて失敗し、重複チェックが
  //   素通りしてしまう不具合があったため、200件ずつに分けて調べる。調べるのに失敗したら取り込みを止める。
  const phones = Array.from(new Set(rows.map((r) => r.phone).filter(Boolean)));
  const existingPhones = new Set<string>();
  const DUP_CHECK_CHUNK = 200;
  for (let i = 0; i < phones.length; i += DUP_CHECK_CHUNK) {
    const chunk = phones.slice(i, i + DUP_CHECK_CHUNK);
    const { data: existing, error: dupError } = await supabase
      .from("leads")
      .select("phone")
      .in("phone", chunk);
    if (dupError) throw new Error(`重複チェックに失敗したため、取り込みを中止しました: ${dupError.message}`);
    for (const r of existing ?? []) {
      if (r.phone) existingPhones.add(r.phone);
    }
  }

  // CSVの中に同じ電話番号の行が複数ある場合も、最初の1行だけを取り込む
  const seenInCsv = new Set<string>();
  const toInsert = rows
    .filter((r) => {
      if (existingPhones.has(r.phone) || seenInCsv.has(r.phone)) return false;
      seenInCsv.add(r.phone);
      return true;
    })
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
      hp_status: r.hp_status,
      status: "未着手",
      assigned_to: needsAssigneeLookup ? resolveAssignee(r.assignee) : effectiveAssignTo,
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
    total: parsedRows.length,
    imported,
    skippedDuplicate: rows.length - toInsert.length,
    skippedNoPhone,
    skippedNoCompany,
    skippedNoAddress,
    unmatchedHeaders,
    assignedByPerson,
    assignedByCompany,
    unmatchedAssignees: Array.from(unmatchedAssigneesSet),
  };
}

// エクスポートしたCSVに手を加えて読み込み直す「更新インポート」。
// 新しいリードを追加するためのものではなく、既存のリードの中身
// （会社名・住所などの誤り修正、担当者の割り振りなど）を直すためのもの。
//   ・電話番号が一致した既存のリードだけを対象にする（一致しない行は何もしない＝新規追加はしない）
//   ・CSVの空欄セルは「変更しない」として扱う
//   ・overwrite = false（既定）：リード側がすでに埋まっている項目は上書きせず、
//     空欄の項目だけをCSVの値で補う（画面で手直しした内容を守るため）
//   ・overwrite = true：CSVに値がある項目は、リード側が埋まっていても上書きする
//     （エクスポートしたCSVの誤りを直して読み込み直す用途）
//   ・同じ電話番号の既存リードが複数ある場合は、誤って別の行を更新しないよう対象外にする
export async function updateLeadsCsv(csvText: string, overwrite = false) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");
  if (me.role !== "admin" && me.role !== "teamlead") {
    throw new Error("既存リストの更新は、管理者・チームリーダーのみ行えます。");
  }

  const { rows: parsedRows, unmatchedHeaders } = parseLeadsCsv(csvText);
  // 電話番号が空の行は、どのリードを更新すべきか特定できないため対象外にする
  const skippedNoPhone = parsedRows.filter((r) => !r.phone.trim()).length;
  const rows = parsedRows.filter((r) => r.phone.trim());
  if (rows.length === 0) {
    return {
      total: parsedRows.length,
      updated: 0,
      unchanged: 0,
      notFound: 0,
      ambiguous: 0,
      noPermission: 0,
      skippedNoPhone,
      unmatchedHeaders,
      assignedByPerson: 0,
      assignedByCompany: 0,
      unmatchedAssignees: [] as string[],
    };
  }

  const lookup = rows.some((r) => r.assignee.trim() !== "")
    ? await buildAssigneeLookup(supabase)
    : { byPersonKey: new Map<string, string>(), guestAdminByCompanyKey: new Map<string, string>() };

  let assignedByPerson = 0;
  let assignedByCompany = 0;
  const unmatchedAssigneesSet = new Set<string>();

  // 電話番号ごとに、対象となる既存リードのidを先にまとめて調べておく
  // （同じ電話番号の行が複数あれば「ambiguous」として更新対象から外す）
  const phones = Array.from(new Set(rows.map((r) => r.phone)));
  const idsByPhone = new Map<string, string[]>();
  type ExistingLeadForUpdate = {
    id: string;
    phone: string;
    company: string | null;
    pref: string | null;
    address: string | null;
    email: string | null;
    url: string | null;
    cms: string | null;
    genre: string | null;
    subgenre: string | null;
    hp_status: string | null;
  };
  const existingById = new Map<string, ExistingLeadForUpdate>();
  const LOOKUP_CHUNK = 500;
  for (let i = 0; i < phones.length; i += LOOKUP_CHUNK) {
    const chunk = phones.slice(i, i + LOOKUP_CHUNK);
    const { data } = await supabase
      .from("leads")
      .select("id, phone, company, pref, address, email, url, cms, genre, subgenre, hp_status")
      .in("phone", chunk);
    for (const row of (data as ExistingLeadForUpdate[]) ?? []) {
      const list = idsByPhone.get(row.phone) ?? [];
      list.push(row.id);
      idsByPhone.set(row.phone, list);
      existingById.set(row.id, row);
    }
  }

  let updated = 0;
  let unchanged = 0;
  let notFound = 0;
  let ambiguous = 0;
  let noPermission = 0;

  for (const r of rows) {
    const ids = idsByPhone.get(r.phone) ?? [];
    if (ids.length === 0) {
      notFound += 1;
      continue;
    }
    if (ids.length > 1) {
      ambiguous += 1;
      continue;
    }

    const patch: Record<string, string> = {};
    const existing = existingById.get(ids[0]);
    // CSVに値があり、かつ（上書きモード、またはリード側がまだ空欄）のときだけ反映する
    const setField = (
      key: "company" | "pref" | "address" | "email" | "url" | "cms" | "genre" | "subgenre" | "hp_status",
      value: string
    ) => {
      if (!value.trim()) return;
      if (!overwrite && (existing?.[key] ?? "").trim() !== "") return;
      patch[key] = value;
    };
    setField("company", r.company);
    setField("pref", r.pref);
    setField("address", r.address);
    setField("email", r.email);
    setField("url", r.url);
    setField("cms", r.cms);
    setField("genre", r.genre);
    setField("subgenre", r.subgenre);
    setField("hp_status", r.hp_status);

    if (r.assignee.trim()) {
      const match = resolveAssigneeMatch(r.assignee, lookup);
      if (match) {
        patch.assigned_to = match.id;
        if (match.via === "person") assignedByPerson += 1;
        else assignedByCompany += 1;
      } else {
        // 一致しなかった担当者欄は変更しない（今の割り当てのまま）
        unmatchedAssigneesSet.add(r.assignee.trim());
      }
    }

    if (Object.keys(patch).length === 0) {
      unchanged += 1;
      continue;
    }

    // count: "exact" を付けて、実際に更新できた件数を確認する。
    // （チームリーダーなど閲覧範囲が限られるロールの場合、対象のリードが
    // 自分の担当範囲外だとRLSにより0件のまま更新され、エラーにはならない
    // ため、件数を見ないと「更新した」と誤って報告してしまう）
    const { error, count } = await supabase.from("leads").update(patch, { count: "exact" }).eq("id", ids[0]);
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) {
      updated += 1;
    } else {
      noPermission += 1;
    }
  }

  revalidatePath("/leads");

  return {
    total: parsedRows.length,
    updated,
    unchanged,
    notFound,
    ambiguous,
    noPermission,
    skippedNoPhone,
    unmatchedHeaders,
    assignedByPerson,
    assignedByCompany,
    unmatchedAssignees: Array.from(unmatchedAssigneesSet),
  };
}

// ---------------------------------------------------------------------------
// 目標管理・稼働日カレンダー
//   実際の権限チェックはデータベース側（RLS）でも行われるが、ここでも先に
//   チェックして分かりやすいエラーメッセージを返す。
// ---------------------------------------------------------------------------

async function requireManageGoalsFor(profileId: string): Promise<Profile> {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");
  const { data: target } = await supabase.from("profiles").select("*").eq("id", profileId).maybeSingle();
  if (!target) throw new Error("対象のメンバーが見つかりません。");
  if (!canManageProfileGoals(me, target as Profile)) {
    throw new Error("このメンバーの目標・カレンダーを変更する権限がありません。");
  }
  return target as Profile;
}

// 月間目標（アポ件数・契約件数）を保存する。
// ページ側で `saveMonthlyGoal.bind(null, profileId, month)` の形にしてフォームの action に
// そのまま渡す想定（フォーム項目名: appointment_target / contract_target）。
export async function saveMonthlyGoal(profileId: string, month: string, formData: FormData) {
  await requireManageGoalsFor(profileId);
  const appointmentTarget = Math.max(0, parseInt(String(formData.get("appointment_target") || "0"), 10) || 0);
  const contractTarget = Math.max(0, parseInt(String(formData.get("contract_target") || "0"), 10) || 0);
  const supabase = await createClient();
  const { error } = await supabase
    .from("monthly_goals")
    .upsert(
      {
        profile_id: profileId,
        month,
        appointment_target: appointmentTarget,
        contract_target: contractTarget,
      },
      { onConflict: "profile_id,month" }
    );
  if (error) throw new Error(error.message);
  revalidatePath("/goals");
}

// 日次のコール件数目標を、月分まとめて保存する。
// フォーム項目名: call_target_2026-09-01 のように、日付ごとに1つずつ。
export async function saveDailyCallGoals(profileId: string, month: string, formData: FormData) {
  await requireManageGoalsFor(profileId);
  const rows = datesInMonth(month)
    .map((date) => {
      const raw = formData.get(`call_target_${date}`);
      if (raw === null) return null;
      const callTarget = Math.max(0, parseInt(String(raw || "0"), 10) || 0);
      return { profile_id: profileId, date, call_target: callTarget };
    })
    .filter((r): r is { profile_id: string; date: string; call_target: number } => r !== null);
  if (rows.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("daily_call_goals").upsert(rows, { onConflict: "profile_id,date" });
  if (error) throw new Error(error.message);
  revalidatePath("/goals");
}

// 稼働日カレンダー（会社全体 or 個人）を、月分まとめて保存する。
// 「平日=稼働・土日=休み・祝日=休み」という既定と同じ内容になる日は、登録行を削除して
// カレンダーを既定に戻す（登録は既定と異なる日だけを持つ）。
// フォーム項目名: working_2026-09-01 のチェックボックス（チェック=稼働日）。
export async function saveWorkDayOverrides(profileId: string | null, month: string, formData: FormData) {
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");
  if (profileId === null) {
    if (!canManageMembers(me)) throw new Error("会社全体の稼働日カレンダーを変更する権限がありません。");
  } else {
    await requireManageGoalsFor(profileId);
  }

  const days = datesInMonth(month).map((date) => ({ date, isWorking: formData.get(`working_${date}`) === "on" }));

  const supabase = await createClient();
  const holidays = holidayMapForMonth(month);
  const toDeleteDates: string[] = [];
  const toUpsert: { profile_id: string | null; date: string; is_working: boolean; created_by: string }[] = [];

  for (const day of days) {
    const isDefault = defaultIsWorking(day.date, holidays) === day.isWorking;
    if (isDefault) {
      toDeleteDates.push(day.date);
    } else {
      toUpsert.push({ profile_id: profileId, date: day.date, is_working: day.isWorking, created_by: me.id });
    }
  }

  if (toDeleteDates.length > 0) {
    let del = supabase.from("work_day_overrides").delete().in("date", toDeleteDates);
    del = profileId === null ? del.is("profile_id", null) : del.eq("profile_id", profileId);
    const { error } = await del;
    if (error) throw new Error(error.message);
  }

  if (toUpsert.length > 0) {
    // 会社全体(profile_idがNULL)と個人とでユニーク制約が別（部分インデックス）のため、
    // upsertの競合対象を指定できない。既存行を1件ずつ確認しながら insert / update する。
    for (const row of toUpsert) {
      let existingQuery = supabase.from("work_day_overrides").select("id").eq("date", row.date);
      existingQuery = row.profile_id === null ? existingQuery.is("profile_id", null) : existingQuery.eq("profile_id", row.profile_id);
      const { data: existing } = await existingQuery.maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("work_day_overrides")
          .update({ is_working: row.is_working })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("work_day_overrides").insert(row);
        if (error) throw new Error(error.message);
      }
    }
  }

  revalidatePath("/goals");
  revalidatePath("/goals/calendar");
}


// ---------------------------------------------------------------------------
// リードのコメント（チャット）
//   宛先（任意）を選ぶと、宛先の人の画面に未読の目印が出る。
//   宛先の人がそのリードを開くと既読になる。
// ---------------------------------------------------------------------------
export async function addLeadComment(leadId: string, body: string, toProfileId: string | null) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const text = body.trim();
  if (!text) throw new Error("コメントを入力してください。");
  if (text.length > 2000) throw new Error("コメントが長すぎます（2,000文字までです）。");

  const { error } = await supabase.from("lead_comments").insert({
    lead_id: leadId,
    author_id: me.id,
    to_profile_id: toProfileId && toProfileId !== me.id ? toProfileId : null,
    body: text,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${leadId}`);
}

export async function deleteLeadComment(commentId: string, leadId: string) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { error } = await supabase.from("lead_comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/", "layout");
}

// このリードの、自分宛の未読コメントを既読にする（リード詳細を開いたときに呼ぶ）。
// 画面左メニューの未読の件数も更新する。
export async function markLeadCommentsRead(leadId: string) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) return;

  const { error } = await supabase
    .from("lead_comments")
    .update({ read_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("to_profile_id", me.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}
