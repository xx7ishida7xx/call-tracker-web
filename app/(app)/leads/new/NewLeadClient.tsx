"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createLead } from "@/app/actions";
import { nameFor, type Profile } from "@/lib/types";
import { btnPrimaryCls, cardCls, errorCls, inputCls, labelCls } from "@/lib/ui";

const EMPTY = {
  company: "",
  pref: "",
  address: "",
  phone: "",
  email: "",
  url: "",
  cms: "",
  genre: "",
  subgenre: "",
  assigned_to: "",
};

export default function NewLeadClient({ roster, canAssign }: { roster: Profile[]; canAssign: boolean }) {
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    if (!form.company && !form.phone) {
      setError("会社名または電話番号のいずれかを入力してください。");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createLead({ ...form, assigned_to: form.assigned_to || null });
      } catch (e) {
        setError(e instanceof Error ? e.message : "登録に失敗しました。");
      }
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/leads" className="hover:text-orange-600 hover:underline">
          リード一覧
        </Link>
        <span>/</span>
        <span className="text-slate-800">新規リード追加</span>
      </div>

      <div className={`${cardCls} p-5`}>
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
          {canAssign && (
            <Field label="担当者">
              <select className={inputCls} value={form.assigned_to} onChange={(e) => setField("assigned_to", e.target.value)}>
                <option value="">未割当</option>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {nameFor(r)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {error && <p className={`mt-3 ${errorCls}`}>{error}</p>}

        <button onClick={submit} disabled={isPending} className={`mt-4 ${btnPrimaryCls}`}>
          {isPending ? "登録中…" : "登録する"}
        </button>
      </div>
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
