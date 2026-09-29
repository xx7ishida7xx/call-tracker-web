import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, type Profile } from "@/lib/types";
import NewLeadClient from "./NewLeadClient";

export default async function NewLeadPage() {
  const me = await getCurrentProfile();
  if (!me) return null;

  const canAssign = canManageMembers(me) || me.role === "teamlead";
  let roster: Profile[] = [];
  if (canAssign) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("*").order("role");
    roster = (data as Profile[]) ?? [];
  }

  return <NewLeadClient roster={roster} canAssign={canAssign} />;
}
