"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateLead, addCall } from "@/app/actions";
import {
  nameFor,
  LEAD_STATUSES,
  BILLING_TYPES,
  DEFAULT_CONTRACT_PRODUCTS,
  type Lead,
  type Profile,
  type Call,
  type ContractItem,
} from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import {
  btnPrimaryCls,
  btnSecondarySmCls,
  cardCls,
  errorCls,
  fieldGroupLabelCls,
  inputCls,
  labelCls,
  sectionTitleCls,
} from "@/lib/ui";

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

  // 契約状況：HP・MEO・SNS運用など、商材ごとに複数行を管理します
  const [contracts, setContracts] = useState<ContractItem[]>(() =>
    lead.contracts && lead.contracts.length > 0
      ? lead.contracts
      : DEFAULT_CONTRACT_PRODUCTS.map((product) => ({
          product,
          company: "",
          billing_type: "",
          monthly_fee: "",
          period: "",
        }))
  );

  function setContractField<K extends keyof ContractItem>(index: number, key: K, value: ContractItem[K]) {
    setContracts((list) => list.map((c, i) => (i === index ? { ...c, [key]: value } : c)));
    setSaved(false);
  }

  function addContractRow() {
    setContracts((list) => [...list, { product: "", company: "", billing_type: "", monthly_fee: "", period: "" }]);
  }

  function removeContractRow(index: number) {
    setContracts((list) => list.filter((_, i) => i !== index));
    setSaved(false);
  }

  function saveLead() {
    setError(null);
    startTransition(async () => {
      try {
        await updateLead(lead.id, {
          ...form,
          assigned_to: form.assigned_to || null,
          contracts,
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
    connected: false,
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
          connected: callForm.connected,
          recall_at: callForm.recall_at ? new Date(callForm.recall_at).toISOString() : null,
          recall_target: callForm.recall_target || null,
          next_status: callForm.next_status,
        });
        setForm((f) => ({ ...f, status: callForm.next_status }));
        setCallForm({
          result: "",
          notes: "",
          appointment: false,
          connected: false,
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
            <p className={fieldGroupLabelCls}>基本情報</p>
            <Field label="会社名" full>
              <input className={inputCls} value={form.company} onChange={(e) => setField("company", e.target.value)} />
            </Field>
            <Field label="都道府県">
              <input className={inputCls} value={form.pref} onChange={(e) => setField("pref", e.target.value)} />
            </Field>
            <Field label="電話番号">
              <div className="flex gap-1.5">
                <input className={inputCls} value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                <QuickCallLink phone={form.phone} />
              </div>
            </Field>
            <Field label="住所" full>
              <input className={inputCls} value={form.address} onChange={(e) => setField("address", e.target.value)} />
            </Field>
            <Field label="メールアドレス">
              <input className={inputCls} value={form.email} onChange={(e) => setField("email", e.target.value)} />
            </Field>
            <Field label="URL">
              <div className="flex gap-1.5">
                <input className={inputCls} value={form.url} onChange={(e) => setField("url", e.target.value)} />
                <QuickOpenLink url={form.url} />
              </div>
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

            <p className={fieldGroupLabelCls}>ステータス・担当</p>
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

            <p className={fieldGroupLabelCls}>顧客側の担当者情報</p>
            <Field label="担当者名（顧客側）">
              <input className={inputCls} value={form.rep_name} onChange={(e) => setField("rep_name", e.target.value)} />
            </Field>
            <Field label="担当者携帯">
              <div className="flex gap-1.5">
                <input className={inputCls} value={form.rep_mobile} onChange={(e) => setField("rep_mobile", e.target.value)} />
                <QuickCallLink phone={form.rep_mobile} />
              </div>
            </Field>
            <Field label="連絡先氏名">
              <input className={inputCls} value={form.contact_name} onChange={(e) => setField("contact_name", e.target.value)} />
            </Field>
            <Field label="連絡先携帯">
              <div className="flex gap-1.5">
                <input className={inputCls} value={form.contact_mobile} onChange={(e) => setField("contact_mobile", e.target.value)} />
                <QuickCallLink phone={form.contact_mobile} />
              </div>
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
              <div className="flex items-end gap-4 pb-2.5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    checked={callForm.connected}
                    onChange={(e) => setCallForm((f) => ({ ...f, connected: e.target.checked }))}
                  />
                  有効架電（担当者と話せた）
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    checked={callForm.appointment}
                    onChange={(e) => setCallForm((f) => ({ ...f, appointment: e.target.checked }))}
                  />
                  アポ獲得
                </label>
              </div>
            </div>

            {callError && <p className={errorCls}>{callError}</p>}

            <button onClick={submitCall} disabled={isPending} className={`self-start ${btnPrimaryCls}`}>
              {isPending ? "登録中…" : "通話記録を追加"}
            </button>
          </div>
        </section>
      </div>

      {/* 契約状況：HP・MEO・SNS運用など、商材ごとに複数行を登録できます */}
      <section className={`${cardCls} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={sectionTitleCls}>契約状況</h2>
          <button type="button" onClick={addContractRow} className={btnSecondarySmCls}>
            + 商材を追加
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-orange-100 bg-orange-50/60 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2">商材</th>
                <th className="px-3 py-2">契約会社名</th>
                <th className="px-3 py-2">契約形態</th>
                <th className="px-3 py-2">月額（円）</th>
                <th className="px-3 py-2">契約期間</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {contracts.map((c, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      placeholder="例：HP、MEO、SNS運用"
                      value={c.product}
                      onChange={(e) => setContractField(i, "product", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={c.company}
                      onChange={(e) => setContractField(i, "company", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={inputCls}
                      value={c.billing_type}
                      onChange={(e) => setContractField(i, "billing_type", e.target.value)}
                    >
                      <option value="">未設定</option>
                      {BILLING_TYPES.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      inputMode="numeric"
                      placeholder="例：30000"
                      value={c.monthly_fee}
                      onChange={(e) => setContractField(i, "monthly_fee", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      placeholder="例：2026/10〜2027/09"
                      value={c.period}
                      onChange={(e) => setContractField(i, "period", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeContractRow(i)}
                      className="text-xs font-medium text-slate-400 hover:text-rose-600"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {contracts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                    「+ 商材を追加」から契約情報を登録できます
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          入力後は上の「保存する」ボタンを押すと、リード情報とあわせて契約状況も保存されます。
        </p>
      </section>

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
                  {c.connected && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">有効架電</span>
                  )}
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

const quickLinkCls =
  "flex shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-slate-500 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600";

// 電話番号の隣に表示する「発信」リンク。tel: リンクなので、Zoom Phoneなどを
// 既定の発信アプリに設定しているパソコンでは、クリックするとそのアプリで発信されます。
function QuickCallLink({ phone }: { phone: string }) {
  const clean = phone.trim();
  if (!clean) return null;
  return (
    <a href={`tel:${clean}`} title="この番号に発信する" className={quickLinkCls}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M4 5c0 8.284 6.716 15 15 15l3-3-5-4-2 2a11 11 0 0 1-6-6l2-2-4-5-3 3Z" />
      </svg>
    </a>
  );
}

// URLの隣に表示する「開く」リンク。新しいタブでブラウザが開きます。
function QuickOpenLink({ url }: { url: string }) {
  const clean = url.trim();
  if (!clean) return null;
  const href = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title="このURLを開く" className={quickLinkCls}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M14 4h6v6M10 14 20 4M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
      </svg>
    </a>
  );
}
