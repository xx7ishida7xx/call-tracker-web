import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import ImportClient from "./ImportClient";

// 大きめのCSV（数千件）を一度に取り込めるよう、サーバー側の実行時間の上限を延長しています
// （デプロイ先のプランによっては、この値まで届かない場合もあります）
export const maxDuration = 60;

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
