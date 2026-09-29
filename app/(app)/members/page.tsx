import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, type Profile } from "@/lib/types";
import MembersClient from "./MembersClient";

export default async function MembersPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  if (!canManageMembers(me)) redirect("/leads");

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  const roster = (data as Profile[]) ?? [];

  return <MembersClient me={me} roster={roster} />;
}
