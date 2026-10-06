"use client";

import { useState } from "react";
import { btnPrimaryCls, btnSecondarySmCls, inputCls, labelCls } from "@/lib/ui";
import { WEEKDAY_LABELS, weekOfMonth } from "@/lib/workday";

type DayCell = {
  date: string; // "YYYY-MM-DD"
  isWorking: boolean;
  value: number;
};

// 日別のコール件数目標の入力フォーム。
// ・日ごとに入力でき、保存すると週次まとめ（第n週の合計）に反映される。
// ・「稼働日にまとめて入れる」で、稼働日すべてに同じ件数を一括入力できる（休みの日は触らない）。
// ・入力中も、週ごとの合計をその場で確認できる。
export default function DailyCallGoalsForm({
  action,
  days,
  leadingBlanks,
  today,
}: {
  action: (formData: FormData) => void | Promise<void>;
  days: DayCell[];
  leadingBlanks: number;
  today: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(days.map((d) => [d.date, String(d.value)]))
  );
  const [bulk, setBulk] = useState("");

  function setOne(date: string, v: string) {
    setValues((prev) => ({ ...prev, [date]: v }));
  }

  function applyBulk() {
    const n = Math.max(0, parseInt(bulk || "0", 10) || 0);
    setValues((prev) => {
      const next = { ...prev };
      for (const d of days) {
        if (d.isWorking) next[d.date] = String(n);
      }
      return next;
    });
  }

  function clearAll() {
    setValues(Object.fromEntries(days.map((d) => [d.date, "0"])));
  }

  const weekTotals = new Map<number, number>();
  let monthTotal = 0;
  for (const d of days) {
    const n = Math.max(0, parseInt(values[d.date] || "0", 10) || 0);
    const w = weekOfMonth(d.date);
    weekTotals.set(w, (weekTotals.get(w) ?? 0) + n);
    monthTotal += n;
  }
  const weekList = Array.from(weekTotals.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-orange-100 bg-orange-50/50 p-3">
        <div>
          <label className={labelCls}>稼働日にまとめて入れる（1日あたりの件数）</label>
          <input
            type="number"
            min={0}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder="例：100"
            className={`${inputCls} mt-1 w-32`}
          />
        </div>
        <button type="button" onClick={applyBulk} className={btnSecondarySmCls}>
          稼働日に入れる
        </button>
        <button type="button" onClick={clearAll} className={btnSecondarySmCls}>
          すべて0にする
        </button>
        <p className="basis-full text-[11px] text-slate-500">
          ボタンを押しただけでは保存されません。内容を確認して、下の「日別目標を保存」を押してください。
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-400">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((d) => {
          const day = Number(d.date.split("-")[2]);
          return (
            <div
              key={d.date}
              className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 ${
                d.isWorking ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"
              } ${d.date === today ? "ring-2 ring-orange-300" : ""}`}
            >
              <span className={`text-[11px] ${d.isWorking ? "text-slate-500" : "text-slate-300"}`}>{day}</span>
              <input
                type="number"
                min={0}
                name={`call_target_${d.date}`}
                value={values[d.date] ?? "0"}
                onChange={(e) => setOne(d.date, e.target.value)}
                className="w-full rounded border border-slate-200 px-1 py-1 text-center text-xs tabular-nums focus:border-orange-400 focus:outline-none"
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        {weekList.map(([w, total]) => (
          <span key={w} className="rounded-full bg-slate-100 px-2.5 py-1">
            第{w}週 <span className="font-bold tabular-nums text-slate-900">{total.toLocaleString()}</span>件
          </span>
        ))}
        <span className="rounded-full bg-orange-100 px-2.5 py-1 font-semibold text-orange-800">
          月合計 <span className="tabular-nums">{monthTotal.toLocaleString()}</span>件
        </span>
      </div>

      <div>
        <button type="submit" className={btnPrimaryCls}>
          日別目標を保存
        </button>
      </div>
    </form>
  );
}
