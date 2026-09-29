import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  if (me.role !== "admin" && me.role !== "teamlead") redirect("/leads");

  let roster: Profile[] = [];
  if (me.role === "admin") {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("*").order("role");
    roster = (data as Profile[]) ?? [];
  }

  return <ImportClient me={me} roster={roster} />;
}
