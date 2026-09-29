import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, nameFor, LEAD_STATUSES, type Profile } from "@/lib/types";
import { currentMonthKey, formatMonthLabel, monthRange, shiftMonthKey } from "@/lib/format";
import { btnSecondarySmCls, cardCls, sectionTitleCls, statChipCls, statChipLabelCls, statChipValueCls } from "@/lib/ui";

type MonthlyMetrics = {
  month: string;
  calls: number;
  effectiveCalls: number;
  appointments: number;
  contracts: number;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) return null;
  if (!canManageMembers(me)) redirect("/leads");

  const supabase = await createClient();

  const sp = await searchParams;
  const thisMonth = currentMonthKey();
  const refMonth = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth;
  // 基準月とその前2ヶ月、計3ヶ月分を比較表示（将来的な月次比較のため）
  const months = [shiftMonthKey(refMonth, -2), shiftMonthKey(refMonth, -1), refMonth];

  const monthlyMetrics: MonthlyMetrics[] = await Promise.all(
    months.map(async (month) => {
      const { start, end } = monthRange(month);
      const [{ count: calls }, { count: effectiveCalls }, { count: appointments }, { count: contracts }] =
        await Promise.all([
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .gte("called_at", start)
            .lt("called_at", end),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("connected", true)
            .gte("called_at", start)
            .lt("called_at", end),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("appointment", true)
            .gte("called_at", start)
            .lt("called_at", end),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .gte("contracted_at", start)
            .lt("contracted_at", end),
        ]);
      return {
        month,
        calls: calls ?? 0,
        effectiveCalls: effectiveCalls ?? 0,
        appointments: appointments ?? 0,
        contracts: contracts ?? 0,
      };
    })
  );

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

      {/* 月次実績：コール数 → 有効コール数 → アポ → 成約 の流れを、直近3ヶ月で比較できます */}
      <section className={`${cardCls} p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={sectionTitleCls}>月次実績（直近3ヶ月比較）</h2>
            <p className="mt-1 text-xs text-slate-500">
              コール数・有効コール数・アポ獲得数・成約数の推移です。「有効架電」は通話記録画面のチェックボックスで記録された分のみ集計されます。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/dashboard?month=${shiftMonthKey(refMonth, -1)}`} className={btnSecondarySmCls}>
              ← 前月
            </Link>
            <span className="text-sm font-semibold text-slate-700">{formatMonthLabel(refMonth)} 基準</span>
            <Link
              href={`/dashboard?month=${shiftMonthKey(refMonth, 1)}`}
              className={refMonth >= thisMonth ? "pointer-events-none rounded-lg border border-slate-100 px-3 py-1.5 text-xs text-slate-300" : btnSecondarySmCls}
            >
              次月 →
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-orange-100 bg-orange-50/60 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2">月</th>
                <th className="px-3 py-2 text-right">コール数</th>
                <th className="px-3 py-2 text-right">有効コール数</th>
                <th className="px-3 py-2 text-right">アポ</th>
                <th className="px-3 py-2 text-right">成約</th>
                <th className="px-3 py-2 text-right text-slate-400">有効率</th>
                <th className="px-3 py-2 text-right text-slate-400">アポ獲得率</th>
                <th className="px-3 py-2 text-right text-slate-400">成約率</th>
              </tr>
            </thead>
            <tbody>
              {monthlyMetrics.map((m) => (
                <tr
                  key={m.month}
                  className={`border-b border-slate-100 last:border-0 ${m.month === refMonth ? "bg-orange-50/40" : ""}`}
                >
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{formatMonthLabel(m.month)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{m.calls.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{m.effectiveCalls.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{m.appointments.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                    {m.contracts.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{rate(m.effectiveCalls, m.calls)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{rate(m.appointments, m.effectiveCalls)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{rate(m.contracts, m.appointments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          成約数は、リードのステータスが「成約」に変わった日時を基準に集計しています。
        </p>
      </section>

      {/* 実績パネル：全体の累計数値をまとめて一覧できるようにしています */}
      <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-sky-700/80">全体実績（累計）</h2>
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

function rate(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
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
