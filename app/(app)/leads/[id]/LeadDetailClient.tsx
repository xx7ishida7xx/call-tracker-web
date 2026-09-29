"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateLead, addCall } from "@/app/actions";
import { nameFor, LEAD_STATUSES, type Lead, type Profile, type Call } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { btnPrimaryCls, cardCls, errorCls, inputCls, labelCls, sectionTitleCls } from "@/lib/ui";

type CallWithCaller = Call & {
  caller: Pick<Profile, "id" | "name" | "display_name" | "email"> | null;
};

export default function LeadDetailClient({
  lead,
  calls,
  roster,
  canAssign,
}: {
  lead: Lead;
  calls: CallWithCaller[];
  roster: Profile[];
  canAssign: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    company: lead.company,
    pref: lead.pref,
    address: lead.address,
    phone: lead.phone,
    email: lead.email,
    url: lead.url,
    cms: lead.cms,
    genre: lead.genre,
    subgenre: lead.subgenre,
    status: lead.status,
    assigned_to: lead.assigned_to ?? "",
    rep_name: lead.rep_name ?? "",
    rep_mobile: lead.rep_mobile ?? "",
    contact_name: lead.contact_name ?? "",
    contact_mobile: lead.contact_mobile ?? "",
  });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function saveLead() {
    setError(null);
    startTransition(async () => {
      try {
        await updateLead(lead.id, {
          ...form,
          assigned_to: form.assigned_to || null,
        });
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました。");
      }
    });
  }

  // 通話記録フォーム
  const [callForm, setCallForm] = useState({
    result: "",
    notes: "",
    appointment: false,
    recall_at: "",
    recall_target: "",
    next_status: lead.status,
  });
  const [callError, setCallError] = useState<string | null>(null);

  function submitCall() {
    setCallError(null);
    startTransition(async () => {
      try {
        await addCall(lead.id, {
          result: callForm.result,
          notes: callForm.notes,
          appointment: callForm.appointment,
          recall_at: callForm.recall_at ? new Date(callForm.recall_at).toISOString() : null,
          recall_target: callForm.recall_target || null,
          next_status: callForm.next_status,
        });
        setForm((f) => ({ ...f, status: callForm.next_status }));
        setCallForm({
          result: "",
          notes: "",
          appointment: false,
          recall_at: "",
          recall_target: "",
          next_status: callForm.next_status,
        });
      } catch (e) {
        setCallError(e instanceof Error ? e.message : "登録に失敗しました。");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/leads" className="hover:text-orange-600 hover:underline">
          リード一覧
        </Link>
        <span>/</span>
        <span className="text-slate-800">{lead.company || "（会社名未登録）"}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* リード情報 */}
        <section className={`${cardCls} p-5`}>
          <h2 className={`mb-4 ${sectionTitleCls}`}>リード情報</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="会社名" full>
              <input className={inputCls} value={form.company} onChange={(e) => setField("company", e.target.value)} />
            </Field>
            <Field label="都道府県">
              <input className={inputCls} value={form.pref} onChange={(e) => setField("pref", e.target.value)} />
            </Field>
            <Field label="電話番号">
              <input className={inputCls} value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
            </Field>
            <Field label="住所" full>
              <input className={inputCls} value={form.address} onChange={(e) => setField("address", e.target.value)} />
            </Field>
            <Field label="メールアドレス">
              <input className={inputCls} value={form.email} onChange={(e) => setField("email", e.target.value)} />
            </Field>
            <Field label="URL">
              <input className={inputCls} value={form.url} onChange={(e) => setField("url", e.target.value)} />
            </Field>
            <Field label="元CMS">
              <input className={inputCls} value={form.cms} onChange={(e) => setField("cms", e.target.value)} />
            </Field>
            <Field label="業種">
              <input className={inputCls} value={form.genre} onChange={(e) => setField("genre", e.target.value)} />
            </Field>
            <Field label="業種詳細">
              <input className={inputCls} value={form.subgenre} onChange={(e) => setField("subgenre", e.target.value)} />
            </Field>
            <Field label="ステータス">
              <select className={inputCls} value={form.status} onChange={(e) => setField("status", e.target.value)}>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            {canAssign && (
              <Field label="担当者">
                <select
                  className={inputCls}
                  value={form.assigned_to}
                  onChange={(e) => setField("assigned_to", e.target.value)}
                >
                  <option value="">未割当</option>
                  {roster.map((r) => (
                    <option key={r.id} value={r.id}>
                      {nameFor(r)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="担当者名（顧客側）">
              <input className={inputCls} value={form.rep_name} onChange={(e) => setField("rep_name", e.target.value)} />
            </Field>
            <Field label="担当者携帯">
              <input className={inputCls} value={form.rep_mobile} onChange={(e) => setField("rep_mobile", e.target.value)} />
            </Field>
            <Field label="連絡先氏名">
              <input className={inputCls} value={form.contact_name} onChange={(e) => setField("contact_name", e.target.value)} />
            </Field>
            <Field label="連絡先携帯">
              <input className={inputCls} value={form.contact_mobile} onChange={(e) => setField("contact_mobile", e.target.value)} />
            </Field>
          </div>

          {error && <p className={`mt-3 ${errorCls}`}>{error}</p>}

          <div className="mt-4 flex items-center gap-3">
            <button onClick={saveLead} disabled={isPending} className={btnPrimaryCls}>
              {isPending ? "保存中…" : "保存する"}
            </button>
            {saved && <span className="text-sm font-medium text-emerald-600">保存しました</span>}
          </div>
        </section>

        {/* 通話記録 */}
        <section className={`${cardCls} p-5`}>
          <h2 className={`mb-4 ${sectionTitleCls}`}>通話を記録する</h2>
          <div className="flex flex-col gap-3">
            <Field label="結果">
              <input
                className={inputCls}
                placeholder="例：担当者不在、要再架電、興味あり など"
                value={callForm.result}
                onChange={(e) => setCallForm((f) => ({ ...f, result: e.target.value }))}
              />
            </Field>
            <Field label="メモ">
              <textarea
                className={inputCls}
                rows={3}
                value={callForm.notes}
                onChange={(e) => setCallForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="次回架電予定日時">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={callForm.recall_at}
                  onChange={(e) => setCallForm((f) => ({ ...f, recall_at: e.target.value }))}
                />
              </Field>
              <Field label="次回架電先">
                <input
                  className={inputCls}
                  value={callForm.recall_target}
                  onChange={(e) => setCallForm((f) => ({ ...f, recall_target: e.target.value }))}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="更新後のステータス">
                <select
                  className={inputCls}
                  value={callForm.next_status}
                  onChange={(e) => setCallForm((f) => ({ ...f, next_status: e.target.value }))}
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-end gap-2 pb-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  checked={callForm.appointment}
                  onChange={(e) => setCallForm((f) => ({ ...f, appointment: e.target.checked }))}
                />
                アポ獲得
              </label>
            </div>

            {callError && <p className={errorCls}>{callError}</p>}

            <button onClick={submitCall} disabled={isPending} className={`self-start ${btnPrimaryCls}`}>
              {isPending ? "登録中…" : "通話記録を追加"}
            </button>
          </div>
        </section>
      </div>

      {/* 通話履歴 */}
      <section className={`${cardCls} p-5`}>
        <h2 className={`mb-4 ${sectionTitleCls}`}>通話履歴</h2>
        {calls.length === 0 ? (
          <p className="text-sm text-slate-400">まだ通話記録がありません</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {calls.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{formatDateTime(c.called_at)}</span>
                  <span>・{c.caller ? nameFor(c.caller) : "不明"}</span>
                  {c.appointment && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">アポ獲得</span>
                  )}
                </div>
                {c.result && <p className="mt-1 text-sm text-slate-800">{c.result}</p>}
                {c.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{c.notes}</p>}
                {c.recall_at && (
                  <p className="mt-1 text-xs text-slate-500">
                    次回架電予定: {formatDateTime(c.recall_at)}
                    {c.recall_target ? `（${c.recall_target}）` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${labelCls} ${full ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
