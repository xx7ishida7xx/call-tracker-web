import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, isGuestRole, nameFor, type Lead, type LeadAttachment, type LeadComment, type Profile, type Call } from "@/lib/types";
import { getAdjacentLeadIds, searchParamsToQueryString, type LeadSearchParams } from "@/lib/leadsFilter";
import { checkGuestRateLimit } from "@/lib/rateLimit";
import { cardCls, errorCls } from "@/lib/ui";
import LeadDetailClient, { type LeadAttachmentView } from "./LeadDetailClient";
import LeadComments, { type LeadCommentView } from "./LeadComments";

// 添付ファイルのダウンロードリンクは、非公開バケットなので毎回署名付きURLを発行する
// （有効期限1時間。期限が切れてもページを開き直せば新しいURLが発行される）
const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60;

// ゲスト（販売店）アカウントが自動ツールなどでリード詳細を次々と大量に開いてくる
// 場合のしきい値。架電中に「次へ」で素早く送っていく通常利用は妨げない程度に
// 一覧ページより緩めにしている。
const GUEST_RATE_LIMIT = { windowSeconds: 60, maxRequests: 80 };

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<LeadSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) return null;

  // ゲスト（販売店）アカウントによる自動ツールでの大量アクセスを防ぐための
  // 簡易レート制限（社内メンバーには影響しない）
  if (isGuestRole(me.role)) {
    const ok = await checkGuestRateLimit(supabase, "lead_detail", GUEST_RATE_LIMIT);
    if (!ok) {
      return (
        <div className={`max-w-lg p-6 ${cardCls}`}>
          <p className={errorCls}>
            アクセスが集中しているため、一時的にリード詳細の表示を制限しています。
            少し時間をおいてから、もう一度お試しください。
          </p>
        </div>
      );
    }
  }

  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  // 一覧画面から引き継いだ絞り込み条件のもとで、前後のリードへ直接移動できるようにする
  const queryString = searchParamsToQueryString(sp);
  const adjacent = await getAdjacentLeadIds(supabase, sp, id);

  const { data: calls } = await supabase
    .from("calls")
    .select(
      "*, caller:profiles!calls_caller_id_fkey(id,name,display_name,email), credit:profiles!calls_appointment_credit_to_fkey(id,name,display_name,email)"
    )
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

  // コメント（チャット）。書き手・宛先の名前は、他社のプロフィールを直接読めないゲストでも表示できるよう、専用の関数で取得する
  const { data: commentRows } = await supabase
    .from("lead_comments")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });
  const rawComments = (commentRows as unknown as LeadComment[]) ?? [];
  const nameIds = Array.from(
    new Set(rawComments.flatMap((c) => [c.author_id, c.to_profile_id]).filter((x): x is string => !!x))
  );
  const nameMap = new Map<string, string>();
  if (nameIds.length > 0) {
    const { data: names } = await supabase.rpc("profile_display_names", { p_ids: nameIds });
    for (const n of (names as { id: string; label: string }[] | null) ?? []) nameMap.set(n.id, n.label);
  }
  const comments: LeadCommentView[] = rawComments.map((c) => ({
    id: c.id,
    author_id: c.author_id,
    author_name: c.author_id ? (nameMap.get(c.author_id) ?? "不明なメンバー") : "不明なメンバー",
    to_profile_id: c.to_profile_id,
    to_name: c.to_profile_id ? (nameMap.get(c.to_profile_id) ?? "不明なメンバー") : null,
    body: c.body,
    created_at: c.created_at,
    read_at: c.read_at,
  }));
  // 宛先に選べる人。MAG（社内）は全メンバー、ゲストはMAGのメンバーと自社のメンバーだけ
  const { data: recipientRows } = await supabase.rpc("mentionable_profiles");
  const recipients = ((recipientRows as { id: string; label: string }[] | null) ?? []).map((r) => ({
    id: r.id,
    name: r.label,
  }));

  return (
    <LeadDetailClient
      lead={lead as Lead}
      calls={(calls as unknown as (Call & { caller: Pick<Profile, "id" | "name" | "display_name" | "email"> | null })[]) ?? []}
      roster={roster}
      canAssign={canManage || me.role === "teamlead"}
      attachments={attachments}
      meId={me.id}
      isAdmin={canManage}
      prevId={adjacent?.prevId ?? null}
      nextId={adjacent?.nextId ?? null}
      queryString={queryString}
      commentsSlot={
        <LeadComments
          leadId={id}
          leadStatus={(lead as Lead).status}
          comments={comments}
          recipients={recipients}
          meId={me.id}
          isAdmin={canManage}
        />
      }
    />
  );
}
