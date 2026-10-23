import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, isLeaderOf, nameFor, type Profile } from "@/lib/types";
import { attachExtraLeaders } from "@/lib/extraLeaders";
import { jstDateKey } from "@/lib/format";
import { btnPrimaryCls, btnSecondarySmCls, cardCls, inputCls, labelCls, sectionTitleCls, statChipCls, statChipLabelCls, statChipValueCls } from "@/lib/ui";

export const dynamic = "force-dynamic";

type CallRow = {
  id: string;
  lead_id: string;
  caller_id: string | null;
  called_at: string;
  result: string;
  connected: boolean;
  appointment: boolean;
  rank: string | null;
  hot: boolean;
  notes: string;
  recall_at: string | null;
  lead: { id: string; company: string; phone: string; pref: string } | null;
};

const MAX_ROWS = 1000;

function shiftDateKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return jstDateKey(d);
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
}

// 自分が通話の記録を見られる相手：自分・自分のチームのメンバー（管理者・オーナーは全員）
function viewableProfiles(me: Profile, roster: Profile[]): Profile[] {
  if (canManageMembers(me)) return roster;
  if (me.role === "teamlead" || me.role === "guest_admin") {
    return roster.filter((p) => p.id === me.id || isLeaderOf(me.id, p));
  }
  return roster.filter((p) => p.id === me.id);
}

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ member?: string; date?: string }> }) {
  const me = await getCurrentProfile();
  if (!me) return null;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: rosterData } = await supabase.from("profiles").select("*").order("created_at");
  const options = viewableProfiles(me, await attachExtraLeaders(supabase, (rosterData as Profile[]) ?? []));
  const optionIds = new Set(options.map((p) => p.id));

  const today = jstDateKey();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  // member: "all"（見られる全員）か、個人のID。既定は、見られる人が自分だけなら自分、複数なら全員。
  const defaultMember = options.length > 1 ? "all" : (options[0]?.id ?? me.id);
  const member = sp.member === "all" || (sp.member && optionIds.has(sp.member)) ? sp.member : defaultMember;
  const targetIds = member === "all" ? options.map((p) => p.id) : [member];

  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  let rows: CallRow[] = [];
  let truncated = false;
  let queryError = "";
  if (targetIds.length > 0) {
    const { data, error } = await supabase
      .from("calls")
      .select("id,lead_id,caller_id,called_at,result,connected,appointment,rank,hot,notes,recall_at,lead:leads(id,company,phone,pref)")
      .in("caller_id", targetIds)
      .gte("called_at", start.toISOString())
      .lt("called_at", end.toISOString())
      .order("called_at", { ascending: false })
      .limit(MAX_ROWS + 1);
    if (error) queryError = error.message;
    rows = ((data ?? []) as unknown as CallRow[]).slice(0, MAX_ROWS);
    truncated = (data ?? []).length > MAX_ROWS;
  }

  const nameById = new Map(options.map((p) => [p.id, nameFor(p)]));
  const total = rows.length;
  const connected = rows.filter((r) => r.connected).length;
  const apo = rows.filter((r) => r.appointment).length;
  const byResult = new Map<string, number>();
  for (const r of rows) byResult.set(r.result || "（結果なし）", (byResult.get(r.result || "（結果なし）") ?? 0) + 1);
  const resultSummary = Array.from(byResult.entries()).sort((a, b) => b[1] - a[1]);

  const hrefFor = (d: string, m: string = member) => `/calls?member=${encodeURIComponent(m)}&date=${d}`;
  const label = member === "all" ? "全員" : (nameById.get(member) ?? "");

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-xl font-bold">コール履歴（日別）</h1>

      <form method="get" className={`${cardCls} flex flex-wrap items-end gap-3 p-4`}>
        {options.length > 1 && (
          <div>
            <label className={labelCls} htmlFor="member">メンバー</label>
            <select id="member" name="member" defaultValue={member} className={inputCls}>
              <option value="all">全員</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameFor(p)}
                </option>
              ))}
            </select>
          </div>
        )}
        {options.length <= 1 && <input type="hidden" name="member" value={member} />}
        <div>
          <label className={labelCls} htmlFor="date">日付</label>
          <input id="date" type="date" name="date" defaultValue={date} className={inputCls} />
        </div>
        <button type="submit" className={btnPrimaryCls}>表示</button>
        <div className="ml-auto flex gap-2">
          <Link href={hrefFor(shiftDateKey(date, -1))} className={btnSecondarySmCls}>前の日</Link>
          <Link href={hrefFor(today)} className={btnSecondarySmCls}>今日</Link>
          <Link href={hrefFor(shiftDateKey(date, 1))} className={btnSecondarySmCls}>次の日</Link>
        </div>
      </form>

      {options.length <= 1 && (me.role === "teamlead" || me.role === "guest_admin") && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          チームのメンバーが登録されていないため、自分の記録だけ表示しています。メンバーの記録を見るには、管理者に「メンバー管理」で、そのメンバーの「チームリーダー」を自分に設定してもらってください。
        </p>
      )}

      <div className={`${cardCls} space-y-3 p-4`}>
        <h2 className={sectionTitleCls}>
          {date.replace(/-/g, "/")} の結果（{label}）
        </h2>
        <div className="flex flex-wrap gap-2">
          <div className={statChipCls}><span className={statChipLabelCls}>コール件数</span><span className={statChipValueCls}>{total.toLocaleString()}</span></div>
          <div className={statChipCls}><span className={statChipLabelCls}>有効架電</span><span className={statChipValueCls}>{connected.toLocaleString()}</span></div>
          <div className={statChipCls}><span className={statChipLabelCls}>アポ</span><span className={statChipValueCls}>{apo.toLocaleString()}</span></div>
        </div>
        {resultSummary.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {resultSummary.map(([r, n]) => (
              <span key={r} className="rounded-full bg-orange-50 px-3 py-1 text-slate-700">
                {r} {n}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={`${cardCls} overflow-x-auto`}>
        {queryError && <div className="p-4 text-sm text-red-600">読み込みに失敗しました：{queryError}</div>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-orange-100 bg-orange-50/60 text-left text-xs font-semibold text-slate-500">
              <th className="whitespace-nowrap px-4 py-2.5">時刻</th>
              {member === "all" && <th className="whitespace-nowrap px-4 py-2.5">メンバー</th>}
              <th className="px-4 py-2.5">会社名</th>
              <th className="whitespace-nowrap px-4 py-2.5">結果</th>
              <th className="whitespace-nowrap px-4 py-2.5">ランク</th>
              <th className="px-4 py-2.5">メモ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top hover:bg-orange-50/40">
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{timeLabel(r.called_at)}</td>
                {member === "all" && <td className="whitespace-nowrap px-4 py-2.5">{nameById.get(r.caller_id ?? "") ?? "-"}</td>}
                <td className="px-4 py-2.5">
                  {r.lead ? (
                    <Link href={`/leads/${r.lead.id}`} className="text-orange-700 underline">
                      {r.lead.company || "（会社名なし）"}
                    </Link>
                  ) : (
                    <span className="text-slate-400">（閲覧権限なし）</span>
                  )}
                  {r.lead?.pref && <span className="ml-2 text-xs text-slate-400">{r.lead.pref}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  {r.result || "-"}
                  {r.appointment && <span className="ml-1 rounded bg-emerald-100 px-1.5 text-xs text-emerald-700">アポ</span>}
                  {r.connected && <span className="ml-1 rounded bg-sky-100 px-1.5 text-xs text-sky-700">有効</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  {r.rank ?? "-"}
                  {r.hot && <span className="ml-1 text-xs text-red-600">激アツ</span>}
                </td>
                <td className="max-w-xs px-4 py-2.5 text-slate-600">{r.notes}</td>
              </tr>
            ))}
            {rows.length === 0 && !queryError && (
              <tr>
                <td colSpan={member === "all" ? 6 : 5} className="px-4 py-8 text-center text-slate-400">
                  この日のコールの記録はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {truncated && <p className="text-xs text-slate-500">件数が多いため、新しい順に{MAX_ROWS}件まで表示しています。</p>}
      <p className="text-xs text-slate-400">
        ※ 自分のチームのメンバー（管理者は全員）の記録が見られます。リードの担当者が変わった通話など、閲覧権限のないリードの通話は表示されないことがあります。
      </p>
    </div>
  );
}
