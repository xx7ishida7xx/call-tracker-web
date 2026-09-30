import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, nameFor, type Lead, type LeadAttachment, type Profile, type Call } from "@/lib/types";
import LeadDetailClient, { type LeadAttachmentView } from "./LeadDetailClient";

// 添付ファイルのダウンロードリンクは、非公開バケットなので毎回署名付きURLを発行する
// （有効期限1時間。期限が切れてもページを開き直せば新しいURLが発行される）
const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) return null;

  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const { data: calls } = await supabase
    .from("calls")
    .select("*, caller:profiles!calls_caller_id_fkey(id,name,display_name,email)")
    .eq("lead_id", id)
    .order("called_at", { ascending: false });

  const canManage = canManageMembers(me);
  let roster: Profile[] = [];
  if (canManage || me.role === "teamlead") {
    const { data } = await supabase.from("profiles").select("*").order("role");
    roster = (data as Profile[]) ?? [];
  }

  const { data: attachmentRows } = await supabase
    .from("lead_attachments")
    .select("*, uploader:profiles!lead_attachments_uploaded_by_fkey(id,name,display_name,email)")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  const attachments: LeadAttachmentView[] = await Promise.all(
    (
      (attachmentRows as unknown as (LeadAttachment & {
        uploader: Pick<Profile, "id" | "name" | "display_name" | "email"> | null;
      })[]) ?? []
    ).map(async (a) => {
      const { data: signed } = await supabase.storage
        .from("lead-attachments")
        .createSignedUrl(a.file_path, ATTACHMENT_SIGNED_URL_TTL_SECONDS);
      return {
        id: a.id,
        lead_id: a.lead_id,
        category: a.category,
        file_name: a.file_name,
        file_size: a.file_size,
        note: a.note,
        uploaded_by: a.uploaded_by,
        uploaded_by_name: a.uploader ? nameFor(a.uploader) : "不明なメンバー",
        created_at: a.created_at,
        url: signed?.signedUrl ?? null,
      };
    })
  );

  return (
    <LeadDetailClient
      lead={lead as Lead}
      calls={(calls as unknown as (Call & { caller: Pick<Profile, "id" | "name" | "display_name" | "email"> | null })[]) ?? []}
      roster={roster}
      canAssign={canManage || me.role === "teamlead"}
      attachments={attachments}
      meId={me.id}
      isAdmin={canManage}
    />
  );
}
