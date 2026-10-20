"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { APO_SUGGESTIONS, type ApoData } from "@/lib/apoSheet";
import { attachApoSheetToLead, deleteApoSheet, saveApoSheet } from "../actions";
import { btnPrimaryCls, btnSecondaryCls, cardCls, errorCls, inputCls, labelCls, sectionTitleCls, successCls } from "@/lib/ui";

type TextKey = keyof ApoData;

export default function ApoForm({
  sheetId,
  leadId,
  initial,
  canDelete,
}: {
  sheetId: string;
  leadId: string;
  initial: ApoData;
  canDelete: boolean;
}) {
  const [data, setData] = useState<ApoData>(initial);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set(key: TextKey, value: string) {
    setData((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setMessage(null);
  }

  // 項目1つぶんの入力欄（候補がある項目は、候補から選ぶことも自由に入力することもできる）
  function field(key: TextKey, label: string, opts: { type?: "text" | "date" | "time"; suggest?: readonly string[]; wide?: boolean } = {}) {
    const listId = opts.suggest ? `apo-list-${key}` : undefined;
    return (
      <label className={`flex flex-col gap-1 ${opts.wide ? "sm:col-span-2" : ""}`}>
        <span className={labelCls}>{label}</span>
        <input
          type={opts.type ?? "text"}
          value={data[key]}
          list={listId}
          onChange={(e) => set(key, e.target.value)}
          className={inputCls}
        />
        {opts.suggest && (
          <datalist id={listId}>
            {opts.suggest.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </label>
    );
  }

  function run(task: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await task();
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました。");
      }
    });
  }

  async function saveIfNeeded() {
    if (dirty) {
      await saveApoSheet(sheetId, data);
      setDirty(false);
    }
  }

  const handleSave = () =>
    run(async () => {
      await saveApoSheet(sheetId, data);
      setDirty(false);
      setMessage("保存しました。");
    });

  const handleDownload = () =>
    run(async () => {
      await saveIfNeeded();
      // ダウンロード用のリンクをクリックしたのと同じ動きにする（画面は移動しない）
      const link = document.createElement("a");
      link.href = `/apo/${sheetId}/download`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

  const handleAttach = () =>
    run(async () => {
      await saveIfNeeded();
      const r = await attachApoSheetToLead(sheetId);
      setMessage(`リードの添付（アポ表）に「${r.fileName}」を登録しました。`);
    });

  const handleDelete = () => {
    if (!window.confirm("このアポ表を削除します。よろしいですか？（リードに添付済みのExcelファイルは消えません）")) return;
    run(async () => {
      await deleteApoSheet(sheetId);
    });
  };

  const gridCls = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className="flex flex-col gap-4">
      <div className={`flex flex-col gap-4 p-5 ${cardCls}`}>
        <h2 className={sectionTitleCls}>日程</h2>
        <div className={gridCls}>
          {field("sales_rep", "営業担当", { suggest: APO_SUGGESTIONS.sales_rep })}
          {field("apo_date", "アポ取得日", { type: "date" })}
          {field("pre_date", "前確日（空欄なら「-」）", { type: "date" })}
          {field("pre_time", "前確時間（空欄なら「-」）", { type: "time" })}
          {field("visit_date", "訪問日", { type: "date" })}
          {field("visit_time", "訪問時間", { type: "time" })}
        </div>
      </div>

      <div className={`flex flex-col gap-4 p-5 ${cardCls}`}>
        <h2 className={sectionTitleCls}>お客様の情報</h2>
        <div className={gridCls}>
          {field("company", "会社名(屋号名)", { wide: true })}
          {field("genre", "業種", { wide: true })}
          {field("phone", "電話番号", { wide: true })}
          {field("mobile", "携帯", { wide: true })}
          {field("address", "住所", { wide: true })}
          {field("rep_name", "代表者名")}
          {field("gender", "性別", { suggest: APO_SUGGESTIONS.gender })}
          {field("age", "年齢", { suggest: APO_SUGGESTIONS.age })}
          {field("meeting_time", "商談時間", { suggest: APO_SUGGESTIONS.meeting_time })}
          {field("approver", "決裁者名")}
          {field("attendee", "同席", { suggest: APO_SUGGESTIONS.attendee })}
          {field("cost_aware", "費用認識", { suggest: APO_SUGGESTIONS.cost_aware })}
        </div>
      </div>

      <div className={`flex flex-col gap-4 p-5 ${cardCls}`}>
        <h2 className={sectionTitleCls}>担当者</h2>
        <div className={gridCls}>
          {field("appointer", "アポインター")}
          {field("negotiator", "商談者", { suggest: APO_SUGGESTIONS.negotiator })}
          {field("companion", "同行者", { suggest: APO_SUGGESTIONS.companion })}
          {field("proposal", "提案種別", { suggest: APO_SUGGESTIONS.proposal })}
        </div>
      </div>

      <div className={`flex flex-col gap-4 p-5 ${cardCls}`}>
        <h2 className={sectionTitleCls}>確認事項</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("hp", "HP")}
          {field("hp_vendor", "HP業者")}
          {field("remaining_debt", "残債")}
          {field("ad_cost", "広告費用")}
          {field("ad_purpose", "広告目的")}
          {field("approval_flow", "決裁フロー")}
          {field("patient_handling", "患者対応状況")}
          {field("vendor_relations", "業者付き合い")}
          {field("duration", "継続期間")}
        </div>
      </div>

      <div className={`flex flex-col gap-4 p-5 ${cardCls}`}>
        <h2 className={sectionTitleCls}>興味を引いたポイント、アポになった経緯</h2>
        <textarea
          value={data.story}
          onChange={(e) => set("story", e.target.value)}
          rows={10}
          className={inputCls}
        />
        <h2 className={sectionTitleCls}>備考</h2>
        <textarea value={data.memo} onChange={(e) => set("memo", e.target.value)} rows={6} className={inputCls} />
      </div>

      {error && <p className={errorCls}>{error}</p>}
      {message && <p className={successCls}>{message}</p>}

      <div className="sticky bottom-0 z-[5] -mx-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-orange-50/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <button type="button" onClick={handleSave} disabled={isPending} className={btnPrimaryCls}>
          {isPending ? "処理中…" : dirty ? "保存する" : "保存済み"}
        </button>
        <button type="button" onClick={handleDownload} disabled={isPending} className={btnSecondaryCls}>
          Excelをダウンロード
        </button>
        <button type="button" onClick={handleAttach} disabled={isPending} className={btnSecondaryCls}>
          リードの添付に登録
        </button>
        <Link href={`/leads/${leadId}`} className={btnSecondaryCls}>
          リードを開く
        </Link>
        {dirty && <span className="text-xs font-semibold text-orange-700">未保存の変更があります</span>}
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="ml-auto rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            削除
          </button>
        )}
      </div>
    </div>
  );
}
