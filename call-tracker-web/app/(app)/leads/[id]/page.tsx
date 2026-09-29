import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, type Lead, type Profile, type Call } from "@/lib/types";
import LeadDetailClient from "./LeadDetailClient";

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

  return (
    <LeadDetailClient
      lead={lead as Lead}
      calls={(calls as unknown as (Call & { caller: Pick<Profile, "id" | "name" | "display_name" | "email"> | null })[]) ?? []}
      roster={roster}
      canAssign={canManage || me.role === "teamlead"}
    />
  );
}
