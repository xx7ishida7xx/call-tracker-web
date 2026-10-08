// 目標管理・稼働日カレンダー画面用の、データ取得ヘルパー（サーバーコンポーネントから使う）。

import type { createClient } from "@/lib/supabase/server";
import { jstDateKey } from "@/lib/format";
import { datesInMonth, holidayMapForMonth, resolveIsWorking } from "@/lib/workday";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type MonthlyGoal = { appointment_target: number; contract_target: number };

export async function getMonthlyGoalsFor(
  supabase: SupabaseClient,
  profileIds: string[],
  month: string
): Promise<Map<string, MonthlyGoal>> {
  const map = new Map<string, MonthlyGoal>();
  if (profileIds.length === 0) return map;
  const { data } = await supabase
    .from("monthly_goals")
    .select("profile_id, appointment_target, contract_target")
    .eq("month", month)
    .in("profile_id", profileIds);
  for (const row of (data ?? []) as { profile_id: string; appointment_target: number; contract_target: number }[]) {
    map.set(row.profile_id, { appointment_target: row.appointment_target, contract_target: row.contract_target });
  }
  return map;
}

export async function getDailyCallGoalsFor(
  supabase: SupabaseClient,
  profileIds: string[],
  month: string
): Promise<Map<string, Map<string, number>>> {
  // profileId -> (date -> call_target)
  const byProfile = new Map<string, Map<string, number>>();
  if (profileIds.length === 0) return byProfile;
  const dates = datesInMonth(month);
  const { data } = await supabase
    .from("daily_call_goals")
    .select("profile_id, date, call_target")
    .gte("date", dates[0])
    .lte("date", dates[dates.length - 1])
    .in("profile_id", profileIds);
  for (const row of (data ?? []) as { profile_id: string; date: string; call_target: number }[]) {
    if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, new Map());
    byProfile.get(row.profile_id)!.set(row.date, row.call_target);
  }
  return byProfile;
}

export type MonthActuals = {
  dailyCallCounts: Map<string, number>;
  appointmentTotal: number;
  contractTotal: number;
  callsTotal: number;
};

// 架電日時（UTCのISO文字列）を、日本時間の日付キーに直す
function toDateKey(iso: string): string {
  return jstDateKey(iso);
}

export async function getMonthActuals(
  supabase: SupabaseClient,
  profileIds: string[],
  start: string,
  end: string
): Promise<MonthActuals> {
  const dailyCallCounts = new Map<string, number>();
  let appointmentTotal = 0;
  let callsTotal = 0;
  let contractTotal = 0;

  if (profileIds.length > 0) {
    const { data: callRows } = await supabase
      .from("calls")
      .select("called_at, appointment")
      .in("caller_id", profileIds)
      .gte("called_at", start)
      .lt("called_at", end);
    for (const row of (callRows ?? []) as { called_at: string; appointment: boolean }[]) {
      const key = toDateKey(row.called_at);
      dailyCallCounts.set(key, (dailyCallCounts.get(key) ?? 0) + 1);
      callsTotal += 1;
      if (row.appointment) appointmentTotal += 1;
    }

    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("assigned_to", profileIds)
      .gte("contracted_at", start)
      .lt("contracted_at", end);
    contractTotal = count ?? 0;
  }

  return { dailyCallCounts, appointmentTotal, contractTotal, callsTotal };
}

// 稼働日カレンダーの登録行（会社全体 or 個人）を、日付 -> 稼働日かどうか のMapで返す
export async function getWorkDayOverrideMap(
  supabase: SupabaseClient,
  profileId: string | null,
  month: string
): Promise<Map<string, boolean>> {
  const dates = datesInMonth(month);
  let query = supabase
    .from("work_day_overrides")
    .select("date, is_working")
    .gte("date", dates[0])
    .lte("date", dates[dates.length - 1]);
  query = profileId === null ? query.is("profile_id", null) : query.eq("profile_id", profileId);
  const { data } = await query;
  const map = new Map<string, boolean>();
  for (const row of (data ?? []) as { date: string; is_working: boolean }[]) map.set(row.date, row.is_working);
  return map;
}

export type DayWorkStatus = { date: string; isWorking: boolean };

// 月内の各日について、会社全体・個人の登録と祝日の既定を踏まえた「稼働日かどうか」を返す
export function computeMonthWorkStatus(
  month: string,
  companyOverrides: Map<string, boolean>,
  personalOverrides: Map<string, boolean> | null
): DayWorkStatus[] {
  const holidays = holidayMapForMonth(month);
  return datesInMonth(month).map((date) => ({
    date,
    isWorking: resolveIsWorking(date, holidays, companyOverrides.get(date), personalOverrides?.get(date)),
  }));
}

// 「今日」以降（今日を含む）で稼働日になっている日数を数える（過去の月は0を返す）
export function countRemainingWorkingDays(dayStatuses: DayWorkStatus[], todayKey: string): number {
  return dayStatuses.filter((d) => d.date >= todayKey && d.isWorking).length;
}

export function countTotalWorkingDays(dayStatuses: DayWorkStatus[]): number {
  return dayStatuses.filter((d) => d.isWorking).length;
}

export function todayKey(): string {
  return jstDateKey();
}
