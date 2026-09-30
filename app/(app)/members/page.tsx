import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, type Profile } from "@/lib/types";
import { getCompanies } from "@/lib/companies";
import MembersClient from "./MembersClient";

export default async function MembersPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  if (!canManageMembers(me)) redirect("/leads");

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  const roster = (data as Profile[]) ?? [];
  const companies = await getCompanies(supabase);

  // 「招待したのに本人がまだ一度もログインしていない」に気づけるように、
  // Supabase Auth側の最終ログイン日時を取得して突き合わせる(Service Role Keyが必要)。
  const admin = createAdminClient();
  const lastSignIns: Record<string, string | null> = {};
  try {
    const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of authList?.users ?? []) {
      lastSignIns[u.id] = u.last_sign_in_at ?? null;
    }
  } catch {
    // 取得に失敗しても画面自体は表示できるようにする(最終ログイン欄が「—」になるだけ)
  }

  return <MembersClient me={me} roster={roster} lastSignIns={lastSignIns} companies={companies} />;
}
