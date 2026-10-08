"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateLead, addCall, updateCall, deleteCall, addLeadAttachment, deleteLeadAttachment } from "@/app/actions";
import {
  nameFor,
  LEAD_STATUSES,
  BILLING_TYPES,
  DEFAULT_CONTRACT_PRODUCTS,
  CMS_MAIN_OPTIONS,
  HP_STATUS_OPTIONS,
  HP_STATUS_HELP,
  CMS_OTHER_SUBOPTIONS,
  CALL_RESULT_GROUP_ORDER,
  CALL_RESULT_GROUPS,
  CALL_RANKS,
  getCallOutcome,
  APO_KIN_STATUS,
  ACQUISITION_DESIRE_OPTIONS,
  ACQUISITION_DESIRE_LABEL,
  ATTACHMENT_CATEGORIES,
  type AttachmentCategory,
  type CallOutcome,
  type Lead,
  type Profile,
  type Call,
  type ContractItem,
} from "@/lib/types";

const CMS_CUSTOM_OTHER = "その他（自由入力）";

// 保存済みの参照元(cms)の値から、選択式UIの「大分類・下位選択肢・自由入力」を逆算する
function splitCmsValue(value: string): { main: string; sub: string; custom: string } {
  if (!value) return { main: "", sub: "", custom: "" };
  const directMains: readonly string[] = CMS_MAIN_OPTIONS.slice(0, 4); // その他を除いた4つ
  if (directMains.includes(value)) return { main: value, sub: "", custom: "" };
  if ((CMS_OTHER_SUBOPTIONS as readonly string[]).includes(value)) {
    return { main: "その他", sub: value, custom: "" };
  }
  return { main: "その他", sub: CMS_CUSTOM_OTHER, custom: value };
}

// 選択式UIの3つの状態から、実際にDBへ保存する1つの文字列を組み立てる
function joinCmsValue(main: string, sub: string, custom: string): string {
  if (!main) return "";
  if (main !== "その他") return main;
  if (sub === CMS_CUSTOM_OTHER) return custom.trim();
  return sub;
}

// ISO文字列を、<input type="datetime-local"> にそのまま渡せる "YYYY-MM-DDTHH:mm" 形式に変換する
function toLocalDatetimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
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

// 添付ファイル1件分の表示用データ。ダウンロードURLは非公開バケットの署名付きURLで、
// サーバー側（page.tsx）で発行済みのものを受け取る（期限切れの場合は null）。
export type LeadAttachmentView = {
  id: string;
  lead_id: string;
  category: string;
  file_name: string;
  file_size: number;
  note: string;
  uploaded_by: string | null;
  uploaded_by_name: string;
  created_at: string;
  url: string | null;
};

const EMPTY_CALL_FORM = {
  resultGroup: "",
  result: "",
  usingFreeText: false,
  freeText: "",
  notes: "",
  recall_at: "",
  recall_target: "",
  rank: "",
  hot: false,
};

export default function LeadDetailClient({
  lead,
  calls,
  roster,
  canAssign,
  attachments,
  meId,
  isAdmin,
  prevId,
  nextId,
  queryString,
}: {
  lead: Lead;
  calls: CallWithCaller[];
  roster: Profile[];
  canAssign: boolean;
  attachments: LeadAttachmentView[];
  meId: string;
  isAdmin: boolean;
  // 一覧画面での絞り込み・並び順を踏まえた「前のリード／次のリード」のID（無ければnull）
  prevId: string | null;
  nextId: string | null;
  // 一覧画面から引き継いだ絞り込み条件（一覧へ戻る／前へ／次へのリンクに引き継ぐ）
  queryString: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 「一覧へ戻る」「前へ」「次へ」で、今の絞り込み条件を引き継いだリンク先を作る
  const listHref = queryString ? `/leads?${queryString}` : "/leads";
  const prevHref = prevId ? (queryString ? `/leads/${prevId}?${queryString}` : `/leads/${prevId}`) : null;
  const nextHref = nextId ? (queryString ? `/leads/${nextId}?${queryString}` : `/leads/${nextId}`) : null;

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
    hp_status: lead.hp_status ?? "",
    status: lead.status,
    assigned_to: lead.assigned_to ?? "",
    rep_name: lead.rep_name ?? "",
    rep_mobile: lead.rep_mobile ?? "",
    contact_name: lead.contact_name ?? "",
    contact_mobile: lead.contact_mobile ?? "",
    credit_company: lead.credit_company ?? "",
    acquisition_desire: lead.acquisition_desire ?? "",
  });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  // 参照元（旧:元CMS）：保存値は1つの文字列だが、UI上は「大分類・下位選択肢・自由入力」の
  // 3段階に分けて選べるようにしている。初期値は保存済みの値から逆算する。
  const initialCms = splitCmsValue(lead.cms);
  const [cmsMain, setCmsMain] = useState(initialCms.main);
  const [cmsSub, setCmsSub] = useState(initialCms.sub);
  const [cmsCustom, setCmsCustom] = useState(initialCms.custom);

  function updateCms(main: string, sub: string, custom: string) {
    setCmsMain(main);
    setCmsSub(sub);
    setCmsCustom(custom);
    setField("cms", joinCmsValue(main, sub, custom));
  }

  // 契約状況：HP・MEO・SNS運用など、商材ごとに複数行を管理します
  // （「有」チェックがまだ無かった時期に保存されたデータは active が undefined になっているため、
  //   falseで補って読み込む）
  const [contracts, setContracts] = useState<ContractItem[]>(() =>
    lead.contracts && lead.contracts.length > 0
      ? lead.contracts.map((c) => ({ ...c, active: c.active ?? false }))
      : DEFAULT_CONTRACT_PRODUCTS.map((product) => ({
          product,
          company: "",
          active: false,
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
    setContracts((list) => [
      ...list,
      { product: "", company: "", active: false, billing_type: "", monthly_fee: "", period: "" },
    ]);
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

  // 通話記録フォーム：結果は「つながらなかった／つながった／その他／訪問結果」の
  // 4グループから1つだけ選ぶ形式。結果を選ぶと有効架電・アポ獲得・ステータスが
  // 自動で連動するため、それらを個別に指定する項目はない。
  const [callForm, setCallForm] = useState(EMPTY_CALL_FORM);
  const [callError, setCallError] = useState<string | null>(null);

  // 入力ミスをやり直したいとき用に、フォームを初期状態へ戻す
  function resetCallForm() {
    setCallError(null);
    setCallForm(EMPTY_CALL_FORM);
  }

  function selectResult(group: string, label: string) {
    setCallForm((f) => ({ ...f, resultGroup: group, result: label, usingFreeText: false }));
  }

  function selectFreeText() {
    setCallForm((f) => ({ ...f, resultGroup: "その他", usingFreeText: true, result: f.freeText }));
  }

  function updateFreeText(value: string) {
    setCallForm((f) => ({ ...f, resultGroup: "その他", usingFreeText: true, freeText: value, result: value }));
  }

  // 通話記録を保存する。保存後にそのままこの画面に残る（従来通り）か、
  // 次のリード／一覧画面へ移動するかを afterSave で切り替える。
  function submitCall(afterSave?: () => void) {
    setCallError(null);
    if (!callForm.resultGroup || !callForm.result.trim()) {
      setCallError("結果を選択してください。");
      return;
    }
    const outcome = getCallOutcome(callForm.resultGroup, callForm.result);
    const nextStatus = outcome.nextStatus ?? lead.status;
    // 「アポ禁」は、オーナー・管理者以外にはその後このリードが見えなくなる重い操作のため、
    // 押し間違いを防ぐ確認を挟む。
    if (outcome.nextStatus === APO_KIN_STATUS) {
      const msg = isAdmin
        ? "このリードのステータスを「アポ禁」にします。よろしいですか？"
        : "このリードを「アポ禁」にします。登録すると、オーナー・管理者以外にはこのリードが表示されなくなります。よろしいですか？";
      if (!window.confirm(msg)) return;
    }
    startTransition(async () => {
      try {
        const callResult = await addCall(lead.id, {
          result: callForm.result,
          result_group: callForm.resultGroup,
          notes: callForm.notes,
          appointment: outcome.appointment,
          connected: outcome.connected,
          recall_at: callForm.recall_at ? new Date(callForm.recall_at).toISOString() : null,
          recall_target: callForm.recall_target || null,
          next_status: nextStatus,
          rank: callForm.rank || null,
          hot: callForm.hot,
        });
        // 担当者が「未割当」だったリードは、記録した本人が自動で担当者になる。
        // 開いている画面の担当者欄にも、再読み込みなしで反映する。
        setForm((f) => ({
          ...f,
          status: nextStatus,
          ...(callResult?.assignedTo ? { assigned_to: callResult.assignedTo } : {}),
        }));
        setCallForm(EMPTY_CALL_FORM);
        // アポ禁にしたリードは、オーナー・管理者以外には見えなくなる。この画面に
        // 留まると「見つかりません」になるため、次のリード（無ければ一覧）へ移動する。
        if (nextStatus === APO_KIN_STATUS && !isAdmin) {
          router.push(nextHref ?? listHref);
          return;
        }
        if (afterSave) {
          afterSave();
        }
      } catch (e) {
        setCallError(e instanceof Error ? e.message : "登録に失敗しました。");
      }
    });
  }

  // 結果を選んだ後、有効架電・アポ獲得・ステータスがどう連動するかのプレビュー文
  function outcomeSummary(outcome: CallOutcome): string {
    const parts = [outcome.connected ? "有効架電：ON" : "有効架電：OFF"];
    if (outcome.appointment) parts.push("アポ獲得：ON");
    parts.push(outcome.nextStatus ? `ステータス → ${outcome.nextStatus}` : "ステータス：変更なし");
    return parts.join("／");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href={listHref} className="hover:text-orange-600 hover:underline">
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
                <QuickPhoneSearchLink phone={form.phone} />
              </div>
            </Field>
            <Field label="住所" full>
              <div className="flex gap-1.5">
                <input className={inputCls} value={form.address} onChange={(e) => setField("address", e.target.value)} />
                <QuickMapLink address={form.address} />
              </div>
            </Field>
            <Field label="メールアドレス">
              <input className={inputCls} value={form.email} onChange={(e) => setField("email", e.target.value)} />
            </Field>
            <Field label="URL">
              <div className="flex gap-1.5">
                <input className={inputCls} value={form.url} onChange={(e) => setField("url", e.target.value)} />
                <QuickOpenLink url={form.url} />
                <QuickRichResultsLink url={form.url} />
              </div>
            </Field>
            <Field label="参照元">
              <div className="flex flex-col gap-1.5">
                <select
                  className={inputCls}
                  value={cmsMain}
                  onChange={(e) => {
                    const newMain = e.target.value;
                    if (newMain === "その他") {
                      updateCms(newMain, cmsSub, cmsCustom);
                    } else {
                      updateCms(newMain, "", "");
                    }
                  }}
                >
                  <option value="">未設定</option>
                  {CMS_MAIN_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                {cmsMain === "その他" && (
                  <select
                    className={inputCls}
                    value={cmsSub}
                    onChange={(e) => updateCms(cmsMain, e.target.value, cmsCustom)}
                  >
                    <option value="">選択してください</option>
                    {CMS_OTHER_SUBOPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                    <option value={CMS_CUSTOM_OTHER}>{CMS_CUSTOM_OTHER}</option>
                  </select>
                )}
                {cmsMain === "その他" && cmsSub === CMS_CUSTOM_OTHER && (
                  <input
                    className={inputCls}
                    placeholder="サービス名を入力（例：ペライチ）"
                    value={cmsCustom}
                    onChange={(e) => updateCms(cmsMain, cmsSub, e.target.value)}
                  />
                )}
              </div>
            </Field>
            <Field label="業種">
              <input className={inputCls} value={form.genre} onChange={(e) => setField("genre", e.target.value)} />
            </Field>
            <Field label="業種詳細">
              <input className={inputCls} value={form.subgenre} onChange={(e) => setField("subgenre", e.target.value)} />
            </Field>
            <Field label="HPの状態">
              <select className={inputCls} value={form.hp_status} onChange={(e) => setField("hp_status", e.target.value)}>
                <option value="">未設定</option>
                {HP_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {form.hp_status && (HP_STATUS_OPTIONS as readonly string[]).includes(form.hp_status) && (
                <p className="mt-1 text-xs text-slate-500">
                  {HP_STATUS_HELP[form.hp_status as (typeof HP_STATUS_OPTIONS)[number]]}
                </p>
              )}
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
            <Field label="代表者名（顧客側）">
              <input className={inputCls} value={form.rep_name} onChange={(e) => setField("rep_name", e.target.value)} />
            </Field>
            <Field label="代表者携帯">
              <div className="flex gap-1.5">
                <input className={inputCls} value={form.rep_mobile} onChange={(e) => setField("rep_mobile", e.target.value)} />
                <QuickCallLink phone={form.rep_mobile} />
              </div>
            </Field>
            <Field label="担当者名（顧客側）">
              <input
                className={inputCls}
                placeholder="例：〇〇様"
                value={form.credit_company}
                onChange={(e) => setField("credit_company", e.target.value)}
              />
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
              {isPending ? "保存中…" : "リード情報を保存する"}
            </button>
            {saved && <span className="text-sm font-medium text-emerald-600">保存しました</span>}
          </div>
        </section>

        {/* 通話記録 */}
        <section className={`${cardCls} p-5`}>
          <h2 className={`mb-4 ${sectionTitleCls}`}>通話を記録する</h2>
          <div className="flex flex-col gap-3">
            <div>
              <p className={`mb-2 ${labelCls}`}>結果</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CALL_RESULT_GROUP_ORDER.map((group) => (
                  <div key={group} className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-bold text-slate-500">{group}</p>
                    <div className="flex flex-col gap-1.5">
                      {CALL_RESULT_GROUPS[group].map((label) => (
                        <label
                          key={label}
                          // 「アポ禁」は押し間違いを防ぐため、直前の項目から区切り線＋余白で離し、赤字で表示する
                          className={
                            label === APO_KIN_STATUS
                              ? "mt-2 flex items-center gap-2 border-t border-slate-200 pt-2.5 text-sm font-semibold text-red-600"
                              : "flex items-center gap-2 text-sm text-slate-700"
                          }
                        >
                          <input
                            type="radio"
                            name="call-result"
                            className="h-4 w-4 shrink-0 border-slate-300 text-orange-600 focus:ring-orange-500"
                            checked={!callForm.usingFreeText && callForm.resultGroup === group && callForm.result === label}
                            onChange={() => selectResult(group, label)}
                          />
                          {label}
                        </label>
                      ))}
                      {group === "その他" && (
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            name="call-result"
                            className="h-4 w-4 shrink-0 border-slate-300 text-orange-600 focus:ring-orange-500"
                            checked={callForm.usingFreeText}
                            onChange={selectFreeText}
                          />
                          <input
                            type="text"
                            placeholder="自由入力"
                            className={`${inputCls} py-1`}
                            value={callForm.freeText}
                            onChange={(e) => updateFreeText(e.target.value)}
                            onFocus={selectFreeText}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {callForm.resultGroup && callForm.result.trim() && (
                <p className="mt-2 text-xs text-slate-400">
                  {outcomeSummary(getCallOutcome(callForm.resultGroup, callForm.result))}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="ランク">
                <select
                  className={inputCls}
                  value={callForm.rank}
                  onChange={(e) => setCallForm((f) => ({ ...f, rank: e.target.value }))}
                >
                  <option value="">なし</option>
                  {CALL_RANKS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="集客意欲">
                <select
                  className={inputCls}
                  value={form.acquisition_desire}
                  onChange={(e) => setField("acquisition_desire", e.target.value)}
                >
                  <option value="">未設定</option>
                  {ACQUISITION_DESIRE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {ACQUISITION_DESIRE_LABEL[o]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end pb-2.5">
                <label className="flex items-center gap-2 text-sm font-semibold text-rose-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    checked={callForm.hot}
                    onChange={(e) => setCallForm((f) => ({ ...f, hot: e.target.checked }))}
                  />
                  激アツ!!
                </label>
              </div>
            </div>
            <p className="-mt-2 text-xs text-slate-400">
              ※集客意欲はリード自体の情報のため、変更した場合は右の「リード情報を保存する」ボタンで保存してください（通話の登録では保存されません）。
            </p>

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

            {callError && <p className={errorCls}>{callError}</p>}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <button onClick={() => submitCall()} disabled={isPending} className={btnPrimaryCls}>
                {isPending ? "登録中…" : "登録"}
              </button>
              <button type="button" onClick={resetCallForm} disabled={isPending} className={btnSecondarySmCls}>
                リセット
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* 前へ/次へ/一覧へ戻る：リード間の移動だけをまとめた操作バー（契約状況の上に配置） */}
      <section className={`${cardCls} flex flex-wrap items-center gap-2 p-4`}>
        {prevHref ? (
          <Link href={prevHref} className={btnSecondarySmCls}>
            ← 前へ
          </Link>
        ) : (
          <span className={`${btnSecondarySmCls} pointer-events-none opacity-40`}>← 前へ</span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={btnSecondarySmCls}>
            次へ →
          </Link>
        ) : (
          <span className={`${btnSecondarySmCls} pointer-events-none opacity-40`}>次へ →</span>
        )}
        <Link href={listHref} className={btnSecondarySmCls}>
          一覧へ戻る
        </Link>
      </section>

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
                <th className="px-3 py-2">有</th>
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
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      title="この商材を契約中（有）の場合はチェック。リード一覧の「◯◯有無」検索はこのチェックで判定します。"
                      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                      checked={c.active}
                      onChange={(e) => setContractField(i, "active", e.target.checked)}
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
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                    「+ 商材を追加」から契約情報を登録できます
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          入力後は上の「リード情報を保存する」ボタンを押すと、リード情報とあわせて契約状況も保存されます。
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
              <CallHistoryItem
                key={c.id}
                call={c}
                meId={meId}
                isAdmin={isAdmin}
                onLeadRestored={(restored) =>
                  setForm((f) => ({
                    ...f,
                    ...(restored.status ? { status: restored.status } : {}),
                    ...(restored.unassigned ? { assigned_to: "" } : {}),
                  }))
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* 添付ファイル（診断レポート／アポ表） */}
      <section className={`${cardCls} p-5`}>
        <h2 className={`mb-1 ${sectionTitleCls}`}>添付ファイル</h2>
        <p className="mb-4 text-xs text-slate-400">
          診断レポートやアポ表のファイルを、点線の枠にドラッグ＆ドロップするか、「ファイルを選んで…アップロード」ボタンで取り込めます（スマホはボタンをお使いください）。過去分もここであわせて確認できます。
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          {ATTACHMENT_CATEGORIES.map((category) => (
            <AttachmentGroup
              key={category}
              leadId={lead.id}
              category={category}
              items={attachments.filter((a) => a.category === category)}
              meId={meId}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// 取り込める添付ファイルの拡張子（ファイル選択の accept と同じ）
const ATTACHMENT_ACCEPT_RE = /\.(pdf|png|jpe?g|webp|xlsx|xls|docx?)$/i;

// 添付ファイルの区分（診断レポート／アポ表）ごとの、ドラッグ＆ドロップのアップロード欄＋履歴一覧
function AttachmentGroup({
  leadId,
  category,
  items,
  meId,
  isAdmin,
}: {
  leadId: string;
  category: AttachmentCategory;
  items: LeadAttachmentView[];
  meId: string;
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ドラッグ＆ドロップ／ファイル選択で受け取ったファイルを、順番にアップロードする。
  // 受け付ける拡張子は、ファイル選択ダイアログの accept と同じ。
  function uploadFiles(fileList: FileList | File[]) {
    setError(null);
    const all = Array.from(fileList);
    if (all.length === 0) return;
    const allowed = all.filter((f) => ATTACHMENT_ACCEPT_RE.test(f.name));
    const rejected = all.filter((f) => !ATTACHMENT_ACCEPT_RE.test(f.name));
    if (allowed.length === 0) {
      setError("このファイルの形式は取り込めません（PDF・画像・Excel・Word に対応しています）。");
      return;
    }
    startTransition(async () => {
      const failures: string[] = [];
      for (let i = 0; i < allowed.length; i++) {
        const file = allowed[i];
        setProgress(`${i + 1}/${allowed.length} 件目をアップロード中…（${file.name}）`);
        const formData = new FormData();
        formData.set("file", file);
        formData.set("category", category);
        formData.set("note", note);
        try {
          await addLeadAttachment(leadId, formData);
        } catch (err) {
          failures.push(`${file.name}：${err instanceof Error ? err.message : "アップロードに失敗しました。"}`);
        }
      }
      setProgress(null);
      if (failures.length < allowed.length) setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      const messages = [...failures];
      if (rejected.length > 0) {
        messages.push(`形式が対応外のため取り込まなかったファイル：${rejected.map((f) => f.name).join("、")}`);
      }
      if (messages.length > 0) setError(messages.join("\n"));
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("このファイルを削除しますか？元に戻せません。")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteLeadAttachment(id, leadId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "削除に失敗しました。");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-slate-700">{category}</h3>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <input
          type="text"
          placeholder="メモ（任意・先に入力しておくと、取り込むファイルに付きます）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!isPending) setDragging(true);
          }}
          onDragLeave={(e) => {
            // 枠の中の子要素への出入りでは解除しない
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (isPending) return;
            uploadFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-6 text-center transition ${
            dragging ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-300 bg-white text-slate-500"
          } ${isPending ? "cursor-wait opacity-60" : ""}`}
        >
          <span className="text-sm font-semibold">
            {isPending ? "アップロード中…" : dragging ? "ここで離すと取り込みます" : `${category}のファイルをここにドラッグ＆ドロップ`}
          </span>
          <span className="text-xs text-slate-400">
            {progress ?? "（複数まとめて可・1ファイル25MBまで）"}
          </span>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => fileInputRef.current?.click()}
          className={`self-start ${btnSecondarySmCls}`}
        >
          {isPending ? "処理中…" : `＋ ファイルを選んで${category}をアップロード`}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
          }}
        />
        {error && <p className={`${errorCls} whitespace-pre-line`}>{error}</p>}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400">まだファイルがありません</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-semibold text-sky-700 hover:underline"
                  >
                    {a.file_name}
                  </a>
                ) : (
                  <span className="block truncate text-sm font-semibold text-slate-400" title="ページを開き直すとダウンロードできます">
                    {a.file_name}（リンク期限切れ）
                  </span>
                )}
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatDateTime(a.created_at)}・{a.uploaded_by_name}
                </p>
                {a.note && <p className="mt-0.5 text-xs text-slate-500">{a.note}</p>}
              </div>
              {(isAdmin || a.uploaded_by === meId) && (
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  disabled={isPending}
                  className="shrink-0 text-xs font-medium text-slate-400 hover:text-rose-600"
                >
                  削除
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 通話履歴の1件分。入力ミスの修正・誤登録の削除ができるよう、編集・削除のUIを持つ。
// 編集・削除ができるのは、その通話を登録した本人か、管理者・オーナーのみ（サーバー側でも確認する）。
function CallHistoryItem({
  call,
  meId,
  isAdmin,
  onLeadRestored,
}: {
  call: CallWithCaller;
  meId: string;
  isAdmin: boolean;
  // 通話記録の削除でステータス・担当者が自動で元に戻ったとき、親画面の各欄を更新するための通知
  onLeadRestored: (restored: { status: string | null; unassigned: boolean }) => void;
}) {
  const canManage = isAdmin || call.caller_id === meId;
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initialUsingFreeText =
    call.result_group === "その他" && !(CALL_RESULT_GROUPS["その他"] as readonly string[]).includes(call.result);
  const [editForm, setEditForm] = useState(() => ({
    resultGroup: call.result_group ?? "",
    result: call.result ?? "",
    usingFreeText: initialUsingFreeText,
    freeText: initialUsingFreeText ? call.result ?? "" : "",
    notes: call.notes ?? "",
    recall_at: toLocalDatetimeInputValue(call.recall_at),
    recall_target: call.recall_target ?? "",
    rank: call.rank ?? "",
    hot: call.hot,
  }));

  function startEdit() {
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setError(null);
    setEditing(false);
    setEditForm({
      resultGroup: call.result_group ?? "",
      result: call.result ?? "",
      usingFreeText: initialUsingFreeText,
      freeText: initialUsingFreeText ? call.result ?? "" : "",
      notes: call.notes ?? "",
      recall_at: toLocalDatetimeInputValue(call.recall_at),
      recall_target: call.recall_target ?? "",
      rank: call.rank ?? "",
      hot: call.hot,
    });
  }

  function selectEditResult(group: string, label: string) {
    setEditForm((f) => ({ ...f, resultGroup: group, result: label, usingFreeText: false }));
  }

  function selectEditFreeText() {
    setEditForm((f) => ({ ...f, resultGroup: "その他", usingFreeText: true, result: f.freeText }));
  }

  function updateEditFreeText(value: string) {
    setEditForm((f) => ({ ...f, resultGroup: "その他", usingFreeText: true, freeText: value, result: value }));
  }

  function saveEdit() {
    setError(null);
    if (!editForm.resultGroup || !editForm.result.trim()) {
      setError("結果を選択してください。");
      return;
    }
    const outcome = getCallOutcome(editForm.resultGroup, editForm.result);
    startTransition(async () => {
      try {
        await updateCall(call.id, {
          result: editForm.result,
          result_group: editForm.resultGroup,
          notes: editForm.notes,
          appointment: outcome.appointment,
          connected: outcome.connected,
          recall_at: editForm.recall_at ? new Date(editForm.recall_at).toISOString() : null,
          recall_target: editForm.recall_target || null,
          rank: editForm.rank || null,
          hot: editForm.hot,
        });
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました。");
      }
    });
  }

  function handleDelete() {
    if (!window.confirm("この通話記録を削除しますか？元に戻せません。")) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteCall(call.id);
        if (result?.restoredStatus || result?.unassigned) {
          onLeadRestored({ status: result.restoredStatus ?? null, unassigned: !!result.unassigned });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "削除に失敗しました。");
      }
    });
  }

  if (!editing) {
    return (
      <li className="py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{formatDateTime(call.called_at)}</span>
          <span>・{call.caller ? nameFor(call.caller) : "不明"}</span>
          {call.connected && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">有効架電</span>
          )}
          {call.appointment && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">アポ獲得</span>
          )}
          {call.hot && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">激アツ!!</span>}
          {call.rank && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">ランク{call.rank}</span>
          )}
          {canManage && (
            <span className="ml-auto flex shrink-0 items-center gap-3">
              <button type="button" onClick={startEdit} className="font-medium text-slate-400 hover:text-orange-600">
                編集
              </button>
              <button type="button" onClick={handleDelete} disabled={isPending} className="font-medium text-slate-400 hover:text-rose-600">
                削除
              </button>
            </span>
          )}
        </div>
        {call.result && <p className="mt-1 text-sm text-slate-800">{call.result}</p>}
        {call.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{call.notes}</p>}
        {call.recall_at && (
          <p className="mt-1 text-xs text-slate-500">
            次回架電予定: {formatDateTime(call.recall_at)}
            {call.recall_target ? `（${call.recall_target}）` : ""}
          </p>
        )}
        {error && <p className={`mt-1 ${errorCls}`}>{error}</p>}
      </li>
    );
  }

  return (
    <li className="py-3">
      <div className="flex flex-col gap-3 rounded-lg border border-orange-200 bg-orange-50/40 p-3">
        <p className="text-xs font-semibold text-slate-500">
          {formatDateTime(call.called_at)}・{call.caller ? nameFor(call.caller) : "不明"} の記録を編集
        </p>
        <div>
          <p className={`mb-2 ${labelCls}`}>結果</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CALL_RESULT_GROUP_ORDER.map((group) => (
              <div key={group} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-bold text-slate-500">{group}</p>
                <div className="flex flex-col gap-1.5">
                  {CALL_RESULT_GROUPS[group].map((label) => (
                    <label
                      key={label}
                      className={
                        label === APO_KIN_STATUS
                          ? "mt-2 flex items-center gap-2 border-t border-slate-200 pt-2.5 text-sm font-semibold text-red-600"
                          : "flex items-center gap-2 text-sm text-slate-700"
                      }
                    >
                      <input
                        type="radio"
                        name={`call-result-edit-${call.id}`}
                        className="h-4 w-4 shrink-0 border-slate-300 text-orange-600 focus:ring-orange-500"
                        checked={!editForm.usingFreeText && editForm.resultGroup === group && editForm.result === label}
                        onChange={() => selectEditResult(group, label)}
                      />
                      {label}
                    </label>
                  ))}
                  {group === "その他" && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name={`call-result-edit-${call.id}`}
                        className="h-4 w-4 shrink-0 border-slate-300 text-orange-600 focus:ring-orange-500"
                        checked={editForm.usingFreeText}
                        onChange={selectEditFreeText}
                      />
                      <input
                        type="text"
                        placeholder="自由入力"
                        className={`${inputCls} py-1`}
                        value={editForm.freeText}
                        onChange={(e) => updateEditFreeText(e.target.value)}
                        onFocus={selectEditFreeText}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="ランク">
            <select
              className={inputCls}
              value={editForm.rank}
              onChange={(e) => setEditForm((f) => ({ ...f, rank: e.target.value }))}
            >
              <option value="">なし</option>
              {CALL_RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-rose-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                checked={editForm.hot}
                onChange={(e) => setEditForm((f) => ({ ...f, hot: e.target.checked }))}
              />
              激アツ!!
            </label>
          </div>
        </div>

        <Field label="メモ">
          <textarea
            className={inputCls}
            rows={3}
            value={editForm.notes}
            onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="次回架電予定日時">
            <input
              type="datetime-local"
              className={inputCls}
              value={editForm.recall_at}
              onChange={(e) => setEditForm((f) => ({ ...f, recall_at: e.target.value }))}
            />
          </Field>
          <Field label="次回架電先">
            <input
              className={inputCls}
              value={editForm.recall_target}
              onChange={(e) => setEditForm((f) => ({ ...f, recall_target: e.target.value }))}
            />
          </Field>
        </div>

        {error && <p className={errorCls}>{error}</p>}

        <div className="flex items-center gap-2 border-t border-orange-100 pt-3">
          <button onClick={saveEdit} disabled={isPending} className={btnPrimaryCls}>
            {isPending ? "保存中…" : "この記録を保存"}
          </button>
          <button type="button" onClick={cancelEdit} disabled={isPending} className={btnSecondarySmCls}>
            キャンセル
          </button>
        </div>
        <p className="text-xs text-slate-400">
          ※編集してもリードの現在のステータスは自動では変わりません。ステータスを変える場合は上のリード情報から変更してください。
        </p>
      </div>
    </li>
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

// 電話番号の隣に表示する「電話番号で検索」リンク。Google検索で電話番号を完全一致（引用符つき）で
// 検索した結果を新しいタブで開きます。
function QuickPhoneSearchLink({ phone }: { phone: string }) {
  const clean = phone.trim();
  if (!clean) return null;
  const href = `https://www.google.com/search?q=${encodeURIComponent(`"${clean}"`)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title="この電話番号でGoogle検索する" className={quickLinkCls}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4.2-4.2" />
      </svg>
    </a>
  );
}

// 住所の隣に表示する「地図」リンク。Googleマップの検索結果を新しいタブで開きます。
function QuickMapLink({ address }: { address: string }) {
  const clean = address.trim();
  if (!clean) return null;
  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title="Googleマップで開く" className={quickLinkCls}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    </a>
  );
}

// URLの隣に表示する「リッチリザルトテスト」リンク。Googleのリッチリザルトテストを新しいタブで開きます。
function QuickRichResultsLink({ url }: { url: string }) {
  const clean = url.trim();
  if (!clean) return null;
  const target = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  const href = `https://search.google.com/test/rich-results?url=${encodeURIComponent(target)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title="リッチリザルトテストを開く" className={quickLinkCls}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    </a>
  );
}
