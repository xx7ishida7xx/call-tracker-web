import type { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// メンバー一覧に、「追加のチームリーダー」のID（extra_team_lead_ids）を付ける。
// 表がまだ無い（SQL未実行）場合などは、そのまま返す（従来どおり動く）。
export async function attachExtraLeaders<T extends Profile>(supabase: SupabaseClient, roster: T[]): Promise<T[]> {
  const { data, error } = await supabase.from("profile_extra_leaders").select("member_id,leader_id");
  if (error || !data) return roster;
  const map = new Map<string, string[]>();
  for (const row of data as { member_id: string; leader_id: string }[]) {
    map.set(row.member_id, [...(map.get(row.member_id) ?? []), row.leader_id]);
  }
  return roster.map((p) => ({ ...p, extra_team_lead_ids: map.get(p.id) ?? [] }));
}
