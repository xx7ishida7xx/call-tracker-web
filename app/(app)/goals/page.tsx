import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  canManageMembers,
  canManageProfileGoals,
  canViewProfileGoals,
  nameFor,
  type Profile,
} from "@/lib/types";
import { currentMonthKey, formatMonthLabel, monthRange, shiftMonthKey } from "@/lib/format";
import {
  computeMonthWorkStatus,
  countRemainingWorkingDays,
  countTotalWorkingDays,
  getDailyCallGoalsFor,
  getMonthActuals,
  getMonthlyGoalsFor,
  getWorkDayOverrideMap,
  todayKey,
} from "@/lib/goalsData";
import { datesInMonth, WEEKDAY_LABELS, weekOfMonth } from "@/lib/workday";
import { saveDailyCallGoals, saveMonthlyGoal } from "@/app/actions";
import {
  btnPrimaryCls,
  btnSecondarySmCls,
  cardCls,
  inputCls,
  labelCls,
  sectionTitleCls,
  statChipCls,
  statChipLabelCls,
  statChipValueCls,
} from "@/lib/ui";

type ScopeKind = "self" | "team" | "org" | "all";

type Scope = {
  kind: ScopeKind;
  label: string;
  profileIds: string[];
  editableProfile: Profile | null;
};

function resolveScope(scopeParam: string | undefined, me: Profile, roster: Profile[]): Scope {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const sepIndex = (scopeParam ?? "").indexOf(":");
  const kindRaw = sepIndex === -1 ? (scopeParam ?? "") : (scopeParam ?? "").slice(0, sepIndex);
  const key = sepIndex === -1 ? "" : (scopeParam ?? "").slice(sepIndex + 1);

  if (kindRaw === "all" && canManageMembers(me)) {
    return { kind: "all", label: "全社", profileIds: roster.map((p) => p.id), editableProfile: null };
  }
  if (kindRaw === "org" && key) {
    const canSeeOrg = canManageMembers(me) || me.org_name === key;
    if (canSeeOrg) {
      const members = roster.filter((p) => p.org_name === key);
      if (members.length > 0) {
        return { kind: "org", label: `${key}（全体）`, profileIds: members.map((p) => p.id), editableProfile: null };
      }
    }
  }
  if (kindRaw === "team" && key) {
    const leader = byId.get(key);
    if (leader && (leader.id === me.id || canManageMembers(me))) {
      const members = roster.filter((p) => p.team_lead_id === key);
      const ids = Array.from(new Set([key, ...members.map((p) => p.id)]));
      return { kind: "team", label: `${nameFor(leader)} チーム`, profileIds: ids, editableProfile: null };
    }
  }
  if (kindRaw === "self" && key) {
    const target = byId.get(key);
    if (target && canViewProfileGoals(me, target)) {
      const editable = canManageProfileGoals(me, target) ? target : null;
      return { kind: "self", label: nameFor(target), profileIds: [target.id], editableProfile: editable };
    }
  }

  // 既定値：管理者は全社、チームリーダー系は自分のチーム、それ以外は自分自身
  if (canManageMembers(me)) {
    return { kind: "all", label: "全社", profileIds: roster.map((p) => p.id), editableProfile: null };
  }
  if (me.role === "teamlead" || me.role === "guest_admin") {
    const members = roster.filter((p) => p.team_lead_id === me.id);
    const ids = Array.from(new Set([me.id, ...members.map((p) => p.id)]));
    return { kind: "team", label: `${nameFor(me)} チーム`, profileIds: ids, editableProfile: null };
  }
  return {
    kind: "self",
    label: nameFor(me),
    profileIds: [me.id],
    editableProfile: canManageProfileGoals(me, me) ? me : null,
  };
}

function buildLinePath(values: number[], maxValue: number, width: number, height: number, padding: number): string {
  if (values.length === 0) return "";
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  const denom = values.length > 1 ? values.length - 1 : 1;
  return values
    .map((v, i) => {
      const x = padding + (usableW * i) / denom;
      const ratio = maxValue > 0 ? v / maxValue : 0;
      const y = padding + usableH * (1 - ratio);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; scope?: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) return null;

  const supabase = await createClient();
  const { data: rosterData } = await supabase.from("profiles").select("*").order("role");
  const roster = (rosterData as Profile[]) ?? [];

  const sp = await searchParams;
  const thisMonth = currentMonthKey();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth;
  const scope = resolveScope(sp.scope, me, roster);

  const hrefFor = (scopeParam: string, m: string = month) =>
    `/goals?scope=${encodeURIComponent(scopeParam)}&month=${m}`;

  // --- サイドバーの選択肢一覧 ---
  type LinkGroup = { group: string; items: { href: string; label: string; active: boolean }[] };
  const groups: LinkGroup[] = [];
  const isActive = (scopeParam: string) => sp.scope === scopeParam || (!sp.scope && scopeParam === defaultScopeParam(me, scope));

  function defaultScopeParam(_me: Profile, resolved: Scope): string {
    if (resolved.kind === "all") return "all";
    if (resolved.kind === "team") return `team:${_me.role === "teamlead" || _me.role === "guest_admin" ? _me.id : ""}`;
    return `self:${_me.id}`;
  }

  const overallItems: { href: string; label: string; active: boolean }[] = [];
  if (canManageMembers(me)) {
    overallItems.push({ href: hrefFor("all"), label: "全社", active: isActive("all") });
  } else if (me.org_name) {
    overallItems.push({
      href: hrefFor(`org:${me.org_name}`),
      label: `${me.org_name}（全体）`,
      active: isActive(`org:${me.org_name}`),
    });
  }
  if (overallItems.length > 0) groups.push({ group: "全体", items: overallItems });

  if (canManageMembers(me)) {
    const orgNames = Array.from(new Set(roster.map((p) => p.org_name).filter((v): v is string => !!v))).sort();
    if (orgNames.length > 0) {
      groups.push({
        group: "会社ごと（ゲスト）",
        items: orgNames.map((org) => ({ href: hrefFor(`org:${org}`), label: org, active: isActive(`org:${org}`) })),
      });
    }
  }

  if (me.role === "teamlead" || me.role === "guest_admin") {
    groups.push({
      group: "チーム",
      items: [{ href: hrefFor(`team:${me.id}`), label: `${nameFor(me)} チーム`, active: isActive(`team:${me.id}`) }],
    });
  }

  const viewableProfiles = roster.filter((p) => canViewProfileGoals(me, p));
  if (viewableProfiles.length > 0) {
    groups.push({
      group: "メンバー",
      items: viewableProfiles.map((p) => ({
        href: hrefFor(`self:${p.id}`),
        label: nameFor(p),
        active: isActive(`self:${p.id}`),
      })),
    });
  }

  // --- データ取得 ---
  const { start, end } = monthRange(month);
  const [monthlyGoalsMap, dailyGoalsMap, actuals, companyOverrides] = await Promise.all([
    getMonthlyGoalsFor(supabase, scope.profileIds, month),
    getDailyCallGoalsFor(supabase, scope.profileIds, month),
    getMonthActuals(supabase, scope.profileIds, start, end),
    getWorkDayOverrideMap(supabase, null, month),
  ]);
  const personalOverrides =
    scope.kind === "self" ? await getWorkDayOverrideMap(supabase, scope.profileIds[0], month) : null;

  const dates = datesInMonth(month);
  const dayStatuses = computeMonthWorkStatus(month, companyOverrides, personalOverrides);
  const workingByDate = new Map(dayStatuses.map((d) => [d.date, d.isWorking]));
  const today = todayKey();
  const remainingWorkingDays = countRemainingWorkingDays(dayStatuses, today);
  const totalWorkingDays = countTotalWorkingDays(dayStatuses);

  let appointmentTarget = 0;
  let contractTarget = 0;
  for (const id of scope.profileIds) {
    const g = monthlyGoalsMap.get(id);
    if (g) {
      appointmentTarget += g.appointment_target;
      contractTarget += g.contract_target;
    }
  }

  const dailyTargetByDate = new Map<string, number>();
  for (const id of scope.profileIds) {
    const m = dailyGoalsMap.get(id);
    if (!m) continue;
    for (const [date, target] of m) {
      dailyTargetByDate.set(date, (dailyTargetByDate.get(date) ?? 0) + target);
    }
  }
  const totalCallTarget = Array.from(dailyTargetByDate.values()).reduce((s, v) => s + v, 0);
  const remainingCallsNeeded = Math.max(0, totalCallTarget - actuals.callsTotal);
  const dailyPace = remainingWorkingDays > 0 ? Math.ceil(remainingCallsNeeded / remainingWorkingDays) : null;

  type WeekRow = { week: number; targetCalls: number; actualCalls: number };
  const weekMap = new Map<number, WeekRow>();
  for (const date of dates) {
    const w = weekOfMonth(date);
    const row = weekMap.get(w) ?? { week: w, targetCalls: 0, actualCalls: 0 };
    row.targetCalls += dailyTargetByDate.get(date) ?? 0;
    row.actualCalls += actuals.dailyCallCounts.get(date) ?? 0;
    weekMap.set(w, row);
  }
  const weekRows = Array.from(weekMap.values()).sort((a, b) => a.week - b.week);

  let cumTarget = 0;
  let cumActual = 0;
  const targetSeries: number[] = [];
  const actualSeries: number[] = [];
  for (const date of dates) {
    cumTarget += dailyTargetByDate.get(date) ?? 0;
    cumActual += actuals.dailyCallCounts.get(date) ?? 0;
    targetSeries.push(cumTarget);
    actualSeries.push(cumActual);
  }
  const chartMax = Math.max(cumTarget, cumActual, 1);
  const chartW = 640;
  const chartH = 200;
  const chartPad = 12;
  const targetPath = buildLinePath(targetSeries, chartMax, chartW, chartH, chartPad);
  const actualPath = buildLinePath(actualSeries, chartMax, chartW, chartH, chartPad);

  const firstDow = new Date(Number(month.split("-")[0]), Number(month.split("-")[1]) - 1, 1).getDay();
  const leadingBlanks = Array.from({ length: firstDow });

  const monthlyGoalForEditable = scope.editableProfile ? monthlyGoalsMap.get(scope.editableProfile.id) : undefined;
  const dailyGoalForEditable = scope.editableProfile ? dailyGoalsMap.get(scope.editableProfile.id) : undefined;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* 表示対象の選択（会社全体・会社ごと・チーム・個人） */}
      <aside className="w-full shrink-0 lg:w-56">
        <div className={`${cardCls} sticky top-4 flex flex-col gap-4 p-4`}>
          {groups.map((g) => (
            <div key={g.group} className="flex flex-col gap-1">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.group}</p>
              {g.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`truncate rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                    item.active
                      ? "bg-orange-100 text-orange-800"
                      : "text-slate-600 hover:bg-orange-50 hover:text-orange-700"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            目標・稼働日 <span className="text-slate-400">/ {scope.label}</span>
          </h1>
          <div className="flex items-center gap-2">
            <Link href={hrefFor(sp.scope ?? defaultScopeParam(me, scope), shiftMonthKey(month, -1))} className={btnSecondarySmCls}>
              ← 前月
            </Link>
            <span className="text-sm font-semibold text-slate-700">{formatMonthLabel(month)}</span>
            <Link
              href={hrefFor(sp.scope ?? defaultScopeParam(me, scope), shiftMonthKey(month, 1))}
              className={btnSecondarySmCls}
            >
              次月 →
            </Link>
            <Link href="/goals/calendar" className={btnSecondarySmCls}>
              稼働日カレンダー
            </Link>
          </div>
        </div>

        {/* 実績サマリー */}
        <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-sky-700/80">
            {formatMonthLabel(month)}の実績・目標
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatChip label="コール件数（目標/実績）" value={`${actuals.callsTotal.toLocaleString()} / ${totalCallTarget.toLocaleString()}`} />
            <StatChip label="アポ件数（目標/実績）" value={`${actuals.appointmentTotal.toLocaleString()} / ${appointmentTarget.toLocaleString()}`} />
            <StatChip label="契約件数（目標/実績）" value={`${actuals.contractTotal.toLocaleString()} / ${contractTarget.toLocaleString()}`} />
            <StatChip label="残り稼働日" value={`${remainingWorkingDays} / ${totalWorkingDays}日`} />
          </div>
          {dailyPace !== null && remainingCallsNeeded > 0 && (
            <p className="mt-3 text-xs text-slate-600">
              コール目標まで残り <span className="font-bold text-orange-700">{remainingCallsNeeded.toLocaleString()}件</span>
              　（残り稼働日から逆算すると、1日あたり
              <span className="font-bold text-orange-700"> {dailyPace.toLocaleString()}件</span> のペースが必要です）
            </p>
          )}
        </section>

        {/* 累計コール件数：目標 vs 実績のグラフ */}
        <section className={`${cardCls} p-5`}>
          <h2 className={sectionTitleCls}>コール件数の推移（月内累計）</h2>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" />目標（累計）
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />実績（累計）
            </span>
          </div>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="mt-2 w-full" preserveAspectRatio="none">
            <line x1={chartPad} y1={chartH - chartPad} x2={chartW - chartPad} y2={chartH - chartPad} stroke="#e2e8f0" strokeWidth={1} />
            {targetPath && <path d={targetPath} fill="none" stroke="#cbd5e1" strokeWidth={2.5} />}
            {actualPath && <path d={actualPath} fill="none" stroke="#ea580c" strokeWidth={2.5} />}
          </svg>
        </section>

        {/* 週次まとめ */}
        <section className={`${cardCls} p-5`}>
          <h2 className={sectionTitleCls}>週次まとめ（コール件数）</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b border-orange-100 bg-orange-50/60 text-left text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2">週</th>
                  <th className="px-3 py-2 text-right">目標</th>
                  <th className="px-3 py-2 text-right">実績</th>
                  <th className="px-3 py-2 text-right text-slate-400">達成率</th>
                </tr>
              </thead>
              <tbody>
                {weekRows.map((w) => (
                  <tr key={w.week} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2.5 font-semibold text-slate-800">第{w.week}週</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{w.targetCalls.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{w.actualCalls.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                      {w.targetCalls > 0 ? `${((w.actualCalls / w.targetCalls) * 100).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 個人の目標入力（編集権限がある場合のみ表示） */}
        {scope.editableProfile && (
          <>
            <section className={`${cardCls} p-5`}>
              <h2 className={sectionTitleCls}>{nameFor(scope.editableProfile)} さんの月間目標</h2>
              <form action={saveMonthlyGoal.bind(null, scope.editableProfile.id, month)} className="mt-3 flex flex-wrap items-end gap-4">
                <div>
                  <label className={labelCls}>月間アポ件数目標</label>
                  <input
                    type="number"
                    min={0}
                    name="appointment_target"
                    defaultValue={monthlyGoalForEditable?.appointment_target ?? 0}
                    className={`${inputCls} mt-1 w-32`}
                  />
                </div>
                <div>
                  <label className={labelCls}>月間契約件数目標</label>
                  <input
                    type="number"
                    min={0}
                    name="contract_target"
                    defaultValue={monthlyGoalForEditable?.contract_target ?? 0}
                    className={`${inputCls} mt-1 w-32`}
                  />
                </div>
                <button type="submit" className={btnPrimaryCls}>
                  保存
                </button>
              </form>
            </section>

            <section className={`${cardCls} p-5`}>
              <h2 className={sectionTitleCls}>{nameFor(scope.editableProfile)} さんの日別コール件数目標</h2>
              <p className="mt-1 text-xs text-slate-500">
                グレーの日は稼働日カレンダー上「休み」に設定されています（土日・祝日を含む）。
              </p>
              <form action={saveDailyCallGoals.bind(null, scope.editableProfile.id, month)} className="mt-3 flex flex-col gap-3">
                <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-400">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label}>{label}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {leadingBlanks.map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}
                  {dates.map((date) => {
                    const day = Number(date.split("-")[2]);
                    const isWorking = workingByDate.get(date) ?? true;
                    const value = dailyGoalForEditable?.get(date) ?? 0;
                    return (
                      <div
                        key={date}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 ${
                          isWorking ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"
                        } ${date === today ? "ring-2 ring-orange-300" : ""}`}
                      >
                        <span className={`text-[11px] ${isWorking ? "text-slate-500" : "text-slate-300"}`}>{day}</span>
                        <input
                          type="number"
                          min={0}
                          name={`call_target_${date}`}
                          defaultValue={value}
                          className="w-full rounded border border-slate-200 px-1 py-1 text-center text-xs tabular-nums focus:border-orange-400 focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
                <div>
                  <button type="submit" className={btnPrimaryCls}>
                    日別目標を保存
                  </button>
                </div>
              </form>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className={statChipCls}>
      <span className={statChipLabelCls}>{label}</span>
      <span className={`${statChipValueCls} text-lg`}>{value}</span>
    </div>
  );
}
