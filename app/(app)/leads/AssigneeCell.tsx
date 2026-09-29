"use client";

import { useState, useTransition } from "react";
import { updateLead } from "@/app/actions";
import { nameFor, type Profile } from "@/lib/types";

// リード一覧の「担当者」欄をその場でプルダウンから変更できるようにするセル。
// 変更するとサーバーに保存され、失敗した場合は元の値に戻します。
export default function AssigneeCell({
  leadId,
  assignedTo,
  roster,
}: {
  leadId: string;
  assignedTo: string | null;
  roster: Profile[];
}) {
  const [value, setValue] = useState(assignedTo ?? "");
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      try {
        await updateLead(leadId, { assigned_to: next || null });
      } catch {
        setValue(prev);
      }
    });
  }

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-transparent bg-transparent py-0.5 pl-1 pr-5 text-sm text-slate-600 transition hover:border-slate-300 hover:bg-white focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-100 disabled:opacity-50"
    >
      <option value="">未割当</option>
      {roster.map((r) => (
        <option key={r.id} value={r.id}>
          {nameFor(r)}
        </option>
      ))}
    </select>
  );
}
