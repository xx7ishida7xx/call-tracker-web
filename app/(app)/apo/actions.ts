"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { nameFor, type Lead } from "@/lib/types";
import { jstDateKey } from "@/lib/format";
import { EMPTY_APO, apoFileName, normalizeApoData, type ApoData } from "@/lib/apoSheet";
import { XLSX_MIME, buildApoXlsx } from "@/lib/apoXlsx";

const ATTACHMENT_BUCKET = "lead-attachments";

// リードの情報から、アポ表の入力欄の初期値を作る（あとから自由に直せる）
function defaultsFromLead(lead: Lead, appointerName: string): ApoData {
  return {
    ...EMPTY_APO,
    apo_date: jstDateKey(),
    company: lead.company ?? "",
    genre: lead.genre ?? "",
    phone: lead.phone ?? "",
    mobile: lead.rep_mobile ?? "",
    address: lead.address ?? "",
    rep_name: lead.rep_name ?? "",
    appointer: appointerName,
    hp: lead.url ?? "",
  };
}

// リードを選んで、新しいアポ表を作る（入力欄にはリードの情報が入った状態で開く）
export async function createApoSheet(leadId: string) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) throw new Error("リードが見つからないか、閲覧する権限がありません。");

  const { data: created, error } = await supabase
    .from("apo_sheets")
    .insert({ lead_id: leadId, created_by: me.id, data: defaultsFromLead(lead as Lead, nameFor(me)) })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "アポ表を作成できませんでした。");

  revalidatePath("/apo");
  redirect(`/apo/${created.id}`);
}

export async function saveApoSheet(id: string, data: ApoData): Promise<{ ok: true }> {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const clean = normalizeApoData(data);
  const { data: updated, error } = await supabase.from("apo_sheets").update({ data: clean }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) {
    throw new Error("このアポ表を保存する権限がありません（作成した本人か管理者のみ編集できます）。");
  }
  revalidatePath("/apo");
  return { ok: true };
}

export async function deleteApoSheet(id: string) {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { data: deleted, error } = await supabase.from("apo_sheets").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!deleted || deleted.length === 0) {
    throw new Error("このアポ表を削除する権限がありません（作成した本人か管理者のみ削除できます）。");
  }
  revalidatePath("/apo");
  redirect("/apo");
}

// 保存済みのアポ表をExcelにして、そのリードの添付ファイル（区分：アポ表）に登録する
export async function attachApoSheetToLead(id: string): Promise<{ fileName: string }> {
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) throw new Error("ログインが必要です。");

  const { data: sheet } = await supabase.from("apo_sheets").select("lead_id,data").eq("id", id).maybeSingle();
  if (!sheet) throw new Error("アポ表が見つからないか、閲覧する権限がありません。");

  const data = normalizeApoData(sheet.data);
  const fileName = apoFileName(data);
  const buf = buildApoXlsx(data);
  const path = `${sheet.lead_id}/${crypto.randomUUID()}.xlsx`;

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, new Blob([new Uint8Array(buf)], { type: XLSX_MIME }), { contentType: XLSX_MIME });
  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await supabase.from("lead_attachments").insert({
    lead_id: sheet.lead_id,
    category: "アポ表",
    file_path: path,
    file_name: fileName,
    file_size: buf.length,
    mime_type: XLSX_MIME,
    note: "アポ表ページから作成",
    uploaded_by: me.id,
  });
  if (insertError) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw new Error(insertError.message);
  }

  revalidatePath(`/leads/${sheet.lead_id}`);
  return { fileName };
}
