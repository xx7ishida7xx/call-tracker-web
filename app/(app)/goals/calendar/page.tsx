import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, manageableProfiles, nameFor, type Profile } from "@/lib/types";
import { currentMonthKey, formatMonthLabel, shiftMonthKey } from "@/lib/format";
import { datesInMonth, holidayMapForMonth, WEEKDAY_LABELS, resolveIsWorking } from "@/lib/workday";
import { getWorkDayOverrideMap, todayKey } from "@/lib/goalsData";
import { saveWorkDayOverrides } from "@/app/actions";
import { btnPrimaryCls, btnSecondarySmCls, cardCls, sectionTitleCls } from "@/lib/ui";

function DayGrid({
  month,
  dates,
  resolved,
  holidays,
  today,
  editable,
}: {
  month: string;
  dates: string[];
  resolved: Map<string, boolean>;
  holidays: Map<string, string>;
  today: string;
  editable: boolean;
}) {
  const firstDow = new Date(Number(month.split("-")[0]), Number(month.split("-")[1]) - 1, 1).getDay();
  const leadingBlanks = Array.from({ length: firstDow });
  return (
    <div className="flex flex-col gap-1.5">
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
          const isWorking = resolved.get(date) ?? true;
          const holidayName = holidays.get(date);
          return (
            <label
              key={date}
              title={holidayName}
              className={`flex flex-col items-center gap-0.5 rounded-lg border p-1.5 text-[11px] ${
                editable ? "cursor-pointer" : ""
              } ${isWorking ? "border-slate-200 bg-white text-slate-700" : "border-slate-100 bg-slate-50 text-slate-400"} ${
                date === today ? "ring-2 ring-orange-300" : ""
              }`}
            >
              <span>{day}</span>
              <input
                type="checkbox"
                name={editable ? `working_${date}` : undefined}
                defaultChecked={isWorking}
                disabled={!editable}
                className="h-4 w-4 accent-orange-600 disabled:opacity-60"
              />
              <span className="h-3 truncate text-[9px] text-slate-300">{holidayName ?? ""}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default async function GoalsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; member?: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) return null;

  const supabase = await createClient();
  const { data: rosterData } = await supabase.from("profiles").select("*").order("role");
  const roster = (rosterData as Profile[]) ?? [];

  const sp = await searchParams;
  const thisMonth = currentMonthKey();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth;

  const dates = datesInMonth(month);
  const holidays = holidayMapForMonth(month);
  const today = todayKey();
  const canManageCompany = canManageMembers(me);

  const companyOverrides = await getWorkDayOverrideMap(supabase, null, month);
  const companyResolved = new Map<string, boolean>(
    dates.map((date) => [date, resolveIsWorking(date, holidays, companyOverrides.get(date), undefined)])
  );

  const manageable = manageableProfiles(me, roster);
  const selectedMemberId = sp.member && manageable.some((p) => p.id === sp.member) ? sp.member : manageable[0]?.id ?? null;
  const selectedMember = selectedMemberId ? manageable.find((p) => p.id === selectedMemberId) ?? null : null;

  let personalResolved: Map<string, boolean> | null = null;
  if (selectedMember) {
    const personalOverrides = await getWorkDayOverrideMap(supabase, selectedMember.id, month);
    personalResolved = new Map<string, boolean>(
      dates.map((date) => [
        date,
        resolveIsWorking(date, holidays, companyOverrides.get(date), personalOverrides.get(date)),
      ])
    );
  }

  const monthHrefBase = (m: string) =>
    `/goals/calendar?month=${m}${selectedMemberId ? `&member=${selectedMemberId}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">稼働日カレンダー</h1>
        <div className="flex items-center gap-2">
          <Link href={monthHrefBase(shiftMonthKey(month, -1))} className={btnSecondarySmCls}>
            ← 前月
          </Link>
          <span className="text-sm font-semibold text-slate-700">{formatMonthLabel(month)}</span>
          <Link href={monthHrefBase(shiftMonthKey(month, 1))} className={btnSecondarySmCls}>
            次月 →
          </Link>
          <Link href="/goals" className={btnSecondarySmCls}>
            目標画面へ戻る
          </Link>
        </div>
      </div>

      {/* 会社全体の休み（創業記念日・年末年始休業など）。土曜日など、平日以外を出勤日にすることもできます。 */}
      <section className={`${cardCls} p-5`}>
        <h2 className={sectionTitleCls}>会社全体の休み・出勤日</h2>
        <p className="mt-1 text-xs text-slate-500">
          何も登録しない日は、土日・祝日は休み、それ以外は稼働日として扱われます。チェックを外すと休みに、入れると出勤日になります（土曜日の出勤日設定もここから行えます）。
          {!canManageCompany && "編集できるのは管理者・オーナーのみです。"}
        </p>
        {canManageCompany ? (
          <form action={saveWorkDayOverrides.bind(null, null, month)} className="mt-3 flex flex-col gap-3">
            <DayGrid month={month} dates={dates} resolved={companyResolved} holidays={holidays} today={today} editable />
            <div>
              <button type="submit" className={btnPrimaryCls}>
                会社全体のカレンダーを保存
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3">
            <DayGrid
              month={month}
              dates={dates}
              resolved={companyResolved}
              holidays={holidays}
              today={today}
              editable={false}
            />
          </div>
        )}
      </section>

      {/* 個人の休み（有給など）。管理できるのは、それぞれの直属の管理者・オーナーです。 */}
      {manageable.length > 0 && (
        <section className={`${cardCls} p-5`}>
          <h2 className={sectionTitleCls}>個人の休み（有給など）</h2>
          <p className="mt-1 text-xs text-slate-500">
            会社全体の設定より、こちらの個人設定が優先されます。対象メンバーを選んでチェックを変更してください。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {manageable.map((p) => (
              <Link
                key={p.id}
                href={`/goals/calendar?month=${month}&member=${p.id}`}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  p.id === selectedMemberId
                    ? "border-orange-300 bg-orange-100 text-orange-800"
                    : "border-slate-300 bg-white text-slate-600 hover:border-orange-300 hover:bg-orange-50"
                }`}
              >
                {nameFor(p)}
              </Link>
            ))}
          </div>
          {selectedMember && personalResolved && (
            <form action={saveWorkDayOverrides.bind(null, selectedMember.id, month)} className="mt-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-slate-700">{nameFor(selectedMember)} さんの{formatMonthLabel(month)}</p>
              <DayGrid month={month} dates={dates} resolved={personalResolved} holidays={holidays} today={today} editable />
              <div>
                <button type="submit" className={btnPrimaryCls}>
                  {nameFor(selectedMember)} さんのカレンダーを保存
                </button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
