import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, nameFor, LEAD_STATUSES, type Profile } from "@/lib/types";
import { cardCls, sectionTitleCls, statChipCls, statChipLabelCls, statChipValueCls } from "@/lib/ui";

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

      {/* 実績パネル：主要な数値をまとめて一覧できるようにしています */}
      <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-sky-700/80">全体実績</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip label="リード総数" value={totalLeads ?? 0} />
          <StatChip label="未割当" value={unassigned ?? 0} />
          <StatChip label="本日の架電件数" value={callsToday ?? 0} />
          <StatChip label="登録メンバー数" value={roster.length} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statusCounts.map((s) => (
            <StatChip key={s.status} label={s.status} value={s.count} compact />
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

function StatChip({ label, value, compact }: { label: string; value: number; compact?: boolean }) {
  return (
    <div className={statChipCls}>
      <span className={statChipLabelCls}>{label}</span>
      <span className={compact ? "text-lg font-bold tabular-nums text-slate-900" : statChipValueCls}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
