import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, nameFor, LEAD_STATUSES, type Profile } from "@/lib/types";
import { cardCls, sectionTitleCls } from "@/lib/ui";

export default async function DashboardPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  if (!canManageMembers(me)) redirect("/leads");

  const supabase = await createClient();

  const { count: totalLeads } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true });

  const { count: unassigned } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("assigned_to", null);

  const statusCounts = await Promise.all(
    LEAD_STATUSES.map(async (status) => {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return { status, count: count ?? 0 };
    })
  );

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const { count: callsToday } = await supabase
    .from("calls")
    .select("id", { count: "exact", head: true })
    .gte("called_at", startOfToday.toISOString());

  const { data: rosterData } = await supabase.from("profiles").select("*").order("role");
  const roster = (rosterData as Profile[]) ?? [];

  const perMember = await Promise.all(
    roster.map(async (m) => {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", m.id);
      return { member: m, count: count ?? 0 };
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-bold tracking-tight text-slate-900">ダッシュボード</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="リード総数" value={totalLeads ?? 0} />
        <StatCard label="未割当" value={unassigned ?? 0} />
        <StatCard label="本日の架電件数" value={callsToday ?? 0} />
        <StatCard label="登録メンバー数" value={roster.length} />
      </div>

      <section className={`${cardCls} p-5`}>
        <h2 className={`mb-3 ${sectionTitleCls}`}>ステータス別件数</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statusCounts.map((s) => (
            <div key={s.status} className="rounded-lg border border-orange-100 bg-orange-50/50 px-3 py-2 text-center">
              <div className="text-xs font-medium text-slate-500">{s.status}</div>
              <div className="text-lg font-bold text-slate-900">{s.count}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${cardCls} p-5`}>
        <h2 className={`mb-3 ${sectionTitleCls}`}>メンバー別 担当件数</h2>
        <ul className="flex flex-col divide-y divide-slate-100">
          {perMember.map(({ member, count }) => (
            <li key={member.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-700">{nameFor(member)}</span>
              <span className="font-semibold text-orange-700">{count.toLocaleString()} 件</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${cardCls} p-4`}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-orange-600">{value.toLocaleString()}</div>
    </div>
  );
}
