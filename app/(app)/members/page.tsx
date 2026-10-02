import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, nameFor, type Profile } from "@/lib/types";
import { getCompanies } from "@/lib/companies";
import MembersClient, { type RateLimitAlert } from "./MembersClient";

// ゲストアカウントの簡易レート制限（migration 0018）で、実際にアクセス集中として
// ブロックされた記録を振り返る期間。これより古いものは一覧に出さない
// （access_log自体はcleanup_access_logを手動実行するまで残り続ける）。
const RATE_LIMIT_ALERT_LOOKBACK_DAYS = 14;

const ROUTE_LABEL: Record<string, string> = {
  leads_list: "リード一覧",
  lead_detail: "リード詳細",
};

export default async function MembersPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  if (!canManageMembers(me)) redirect("/leads");

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  const roster = (data as Profile[]) ?? [];
  const companies = await getCompanies(supabase);

  // 「招待したのに本人がまだ一度もログインしていない」に気づけるように、
  // Supabase Auth側の最終ログイン日時を取得して突き合わせる（Service Role Keyが必要）。
  const admin = createAdminClient();
  const lastSignIns: Record<string, string | null> = {};
  try {
    const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of authList?.users ?? []) {
      lastSignIns[u.id] = u.last_sign_in_at ?? null;
    }
  } catch {
    // 取得に失敗しても画面自体は表示できるようにする（最終ログイン欄が「—」になるだけ）
  }

  // ゲストアカウントの自動ツール対策（簡易レート制限）で、実際にアクセス集中として
  // ブロックされた記録があれば、誰が・どのページで・何回・いつ最後に、をまとめて
  // 画面上部にアラート表示する（migration 0018 が未反映の環境ではテーブル自体が
  // 無いため、エラーになっても画面全体は表示できるようにしておく）。
  const rateLimitAlerts: RateLimitAlert[] = [];
  try {
    const since = new Date();
    since.setDate(since.getDate() - RATE_LIMIT_ALERT_LOOKBACK_DAYS);
    const { data: blockedRows } = await supabase
      .from("access_log")
      .select("profile_id, route, created_at")
      .eq("blocked", true)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);

    const rosterById = new Map(roster.map((p) => [p.id, p]));
    const grouped = new Map<string, RateLimitAlert>();
    for (const row of (blockedRows as { profile_id: string; route: string; created_at: string }[]) ?? []) {
      const key = `${row.profile_id}:${row.route}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        if (row.created_at > existing.lastAt) existing.lastAt = row.created_at;
      } else {
        const profile = rosterById.get(row.profile_id);
        grouped.set(key, {
          profileId: row.profile_id,
          name: profile ? nameFor(profile) : "不明なアカウント",
          route: ROUTE_LABEL[row.route] ?? row.route,
          count: 1,
          lastAt: row.created_at,
        });
      }
    }
    rateLimitAlerts.push(...Array.from(grouped.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)));
  } catch {
    // migration 0018 未反映などで access_log テーブルが無い場合は、アラート無しとして扱う
  }

  return (
    <MembersClient
      me={me}
      roster={roster}
      lastSignIns={lastSignIns}
      companies={companies}
      rateLimitAlerts={rateLimitAlerts}
    />
  );
}
