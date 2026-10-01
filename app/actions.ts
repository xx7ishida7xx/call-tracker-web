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
export async function createCompany(name: string) {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) {
    throw new Error("会社を登録する権限がありません。");
  }
  const cleanName = name.trim();
  if (!cleanName) throw new Error("会社名を入力してください。");

  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").insert({ name: cleanName }).select("id, name").single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("同じ名前の会社がすでに登録されています。");
    }
    throw new Error(error.message);
  }
  revalidatePath("/members");
  return { id: data.id as string, name: data.name as string };
}

export async function renameCompany(id: string, name: string) {
  const me = await getCurrentProfile();
  if (!me || !canManageMembers(me)) {
    throw new Error("会社名を変更する権限がありません。");
  }
  const cleanName = name.trim();
  if (!cleanName) throw new Error("会社名を入力してください。");

  const supabase = await createClient();
  const { data: existing } = await supabase.from("companies").select("name").eq("id", id).maybeSingle();
  if (!existing) throw new Error("会社が見つかりませんでした。");

  const { error } = await supabase.from("companies").update({ name: cleanName }).eq("id", id);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("同じ名前の会社がすでに登録されています。");
    }
    throw new Error(error.message);
  }

  // 所属メンバーの org_name（文字列で持っている）も、新しい会社名に合わせて更新する
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
//   ・requestPasswordReset：ログイン画面から本人が申請する場合
//   ・sendMemberPasswordReset：メンバー管理画面からオーナー・管理者が代理で送る場合
// ---------------------------------------------------------------------------
async function sendResetEmail(email: string) {
  const h = await headers();
  const host = h.get("host");
  const origin = host ? `https://${host}` : undefined;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin ? `${origin}/auth/confirm?next=/set-password` : undefined,
  });
  if (error) throw new Error(error.message);
}

export async function requestPasswordReset(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("正しいメールアドレスを入力してください。");
  }
  // 登録の有無にかかわらず同じ結果を返す（メールアドレスの存在有無を外部に漏らさないため）
  await sendResetEmail(cleanEmail);
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

  await sendResetEmail(target.email);
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
// CSV インポート
// ---------------------------------------------------------------------------
function normalizeAssigneeText(s: string): string {
  return s.trim().toLowerCase().replace(/　/g, " ");
}

export async function importLeadsCsv(csvText: string, assignTo: string | null) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { rows, unmatchedHeaders } = parseLeadsCsv(csvText);
  if (rows.length === 0) {
    return {
      total: 0,
      imported: 0,
      skippedDuplicate: 0,
      unmatchedHeaders,
      assignedByPerson: 0,
      assignedByCompany: 0,
      unmatchedAssignees: [] as string[],
    };
  }

  // 管理者・チームリーダー以外は自分自身にしか割り当てられない
  const effectiveAssignTo =
    me.role === "admin" || me.role === "teamlead" ? assignTo : me.id;

  // CSVの「担当者」欄（個人名 または ゲスト会社名）から、行ごとに割り当て先を決める準備。
  // 個人名に一致すればその人へ、会社名に一致すればその会社のゲスト管理者へ割り当てる。
  const needsAssigneeLookup =
    (me.role === "admin" || me.role === "teamlead") && rows.some((r) => r.assignee.trim() !== "");

  const byPersonKey = new Map<string, string>(); // 正規化した名前・表示名・メール -> profile id
  const guestAdminByCompanyKey = new Map<string, string>(); // 正規化した会社名 -> ゲスト管理者の profile id

  if (needsAssigneeLookup) {
    const { data: rosterData } = await supabase
      .from("profiles")
      .select("id, name, display_name, email, role, org_name");
    const roster =
      (rosterData as { id: string; name: string | null; display_name: string | null; email: string; role: Role; org_name: string | null }[]) ??
      [];
    for (const p of roster) {
      for (const candidate of [p.display_name, p.name, p.email]) {
        if (candidate && candidate.trim()) byPersonKey.set(normalizeAssigneeText(candidate), p.id);
      }
      if (p.role === "guest_admin" && p.org_name && p.org_name.trim()) {
        const key = normalizeAssigneeText(p.org_name);
        if (!guestAdminByCompanyKey.has(key)) guestAdminByCompanyKey.set(key, p.id);
      }
    }
  }

  let assignedByPerson = 0;
  let assignedByCompany = 0;
  const unmatchedAssigneesSet = new Set<string>();

  function resolveAssignee(raw: string): string | null {
    const value = raw.trim();
    if (!value) return effectiveAssignTo;
    const key = normalizeAssigneeText(value);
    const personId = byPersonKey.get(key);
    if (personId) {
      assignedByPerson += 1;
      return personId;
    }
    const companyAdminId = guestAdminByCompanyKey.get(key);
    if (companyAdminId) {
      assignedByCompany += 1;
      return companyAdminId;
    }
    unmatchedAssigneesSet.add(value);
    return effectiveAssignTo;
  }

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
    total: rows.length,
    imported,
    skippedDuplicate: rows.length - toInsert.length,
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
