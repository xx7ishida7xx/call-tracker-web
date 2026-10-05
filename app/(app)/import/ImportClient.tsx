"use client";

import { useRef, useState, useTransition } from "react";
import { importLeadsCsv, updateLeadsCsv } from "@/app/actions";
import { nameFor, type Profile } from "@/lib/types";
import { btnPrimaryCls, btnSecondarySmCls, cardCls, errorCls, inputCls } from "@/lib/ui";

type ImportResult = {
  total: number;
  imported: number;
  skippedDuplicate: number;
  skippedNoPhone: number;
  unmatchedHeaders: string[];
  assignedByPerson: number;
  assignedByCompany: number;
  unmatchedAssignees: string[];
};

type UpdateResult = {
  total: number;
  updated: number;
  unchanged: number;
  notFound: number;
  ambiguous: number;
  noPermission: number;
  skippedNoPhone: number;
  unmatchedHeaders: string[];
  assignedByPerson: number;
  assignedByCompany: number;
  unmatchedAssignees: string[];
};

type Mode = "new" | "update";

export default function ImportClient({ me, roster }: { me: Profile; roster: Profile[] }) {
  const [mode, setMode] = useState<Mode>("new");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [assignTo, setAssignTo] = useState("");
  // 更新インポートで、リード側がすでに埋まっている項目もCSVの値で上書きするか（既定：しない＝空欄だけ埋める）
  const [overwrite, setOverwrite] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setImportResult(null);
    setUpdateResult(null);
    setError(null);
  }

  function handleRun() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("CSVファイルを選択してください。");
      return;
    }
    setError(null);
    setImportResult(null);
    setUpdateResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      startTransition(async () => {
        try {
          if (mode === "new") {
            const r = await importLeadsCsv(text, assignTo || null);
            setImportResult(r);
          } else {
            const r = await updateLeadsCsv(text, overwrite);
            setUpdateResult(r);
          }
          if (fileRef.current) fileRef.current.value = "";
          setFileName("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "取り込みに失敗しました。");
        }
      });
    };
    reader.onerror = () => setError("ファイルの読み込みに失敗しました。");
    reader.readAsText(file, "utf-8");
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">CSVインポート</h1>
        {(me.role === "admin" || me.role === "teamlead") && (
          <a href="/leads-export" className={btnSecondarySmCls}>
            全リードをCSVでエクスポート
          </a>
        )}
      </div>

      <p className="text-sm text-slate-500">
        列名は「会社名, 都道府県, 住所, 電話番号, メールアドレス, URL, 元CMS, 業種, 業種詳細, 担当者」に対応しています（順不同）。
        電話番号が空の行は、架電対象として使えないため取り込みの対象外になります。
      </p>

      {/* モード切り替え：新規にリードを足すのか、エクスポートしたCSVを直して既存のリードを更新するのか */}
      <div className={`flex flex-col gap-2 ${cardCls} p-4`}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => switchMode("new")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
              mode === "new"
                ? "border-orange-300 bg-orange-100 text-orange-800"
                : "border-slate-300 bg-white text-slate-600 hover:border-orange-300 hover:bg-orange-50"
            }`}
          >
            ① 新規リストの読み込み
          </button>
          <button
            type="button"
            onClick={() => switchMode("update")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
              mode === "update"
                ? "border-orange-300 bg-orange-100 text-orange-800"
                : "border-slate-300 bg-white text-slate-600 hover:border-orange-300 hover:bg-orange-50"
            }`}
          >
            ② 既存リストの更新
          </button>
        </div>

        {mode === "new" ? (
          <p className="text-xs text-slate-500">
            まだ登録されていないリードを新しく追加します。電話番号が既に登録されている行は、重複登録を避けるため自動的にスキップされます（中身の更新はされません）。
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            既存のリードの中身を、CSVの内容で更新します。<b>電話番号が一致した行だけ</b>
            が対象で、一致しない行（新しいリード）は何も登録されません。<b>CSVの空欄のセルは「変更しない」</b>
            として扱われるので、触っていない列はそのまま残ります。
          </p>
        )}
        {mode === "update" && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">
            <label className="flex items-start gap-2">
              <input type="radio" name="overwrite" checked={!overwrite} onChange={() => setOverwrite(false)} className="mt-1" />
              <span>
                <b>空欄だけ埋める（おすすめ）</b>
                <span className="block text-xs text-slate-500">
                  リードの項目がすでに入力済みなら、そのまま残します。画面で手直しした内容を守りたいときや、外部のリストで足りない項目だけ補いたいときに使います。
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="overwrite" checked={overwrite} onChange={() => setOverwrite(true)} className="mt-1" />
              <span>
                <b>入力済みの項目も上書きする</b>
                <span className="block text-xs text-slate-500">
                  エクスポートしたCSVの誤りを直して読み込み直すときなど、CSVの内容を正として置き換えたいときに使います。画面で手直しした内容も、CSVの値で上書きされます。
                </span>
              </span>
            </label>
          </div>
        )}

        {(me.role === "admin" || me.role === "teamlead") && (
          <p className="mt-1 rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-xs text-slate-600">
            「担当者」列には、担当させたい人の表示名・登録名・メールアドレスのいずれか、または担当させたいゲスト会社名（「会社の管理」で登録した名前と完全一致）を入れておくと、行ごとに自動で割り当てます。
            会社名を入れた行は、その会社のゲスト管理者に割り当てられます（会社に所属する全員が、会社単位で閲覧・架電できるようになります）。
            {mode === "new"
              ? "一致しない・空欄の行は、下で選んだ担当者（未選択なら未割当）になります。"
              : "一致しない・空欄の行は、今の担当者のまま変更されません。"}
          </p>
        )}
      </div>

      <div className={`flex flex-col gap-4 ${cardCls} p-5`}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">CSVファイル</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            className="text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-orange-700 hover:file:bg-orange-100"
          />
        </label>

        {mode === "new" && roster.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">今回インポートする分の担当者をまとめて指定（任意）</span>
            <select className={inputCls} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">未割当のままにする</option>
              {roster.map((r) => (
                <option key={r.id} value={r.id}>
                  {nameFor(r)}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === "new" && me.role === "teamlead" && (
          <p className="text-xs text-slate-500">チームリーダーとしてインポートすると、リードは自分に割り当てられます。</p>
        )}

        {error && <p className={errorCls}>{error}</p>}

        {importResult && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <p>
              {importResult.total} 件中 {importResult.imported} 件を取り込みました
              {importResult.skippedDuplicate > 0 && `（電話番号重複で ${importResult.skippedDuplicate} 件をスキップ）`}
              {importResult.skippedNoPhone > 0 && `（電話番号なしで ${importResult.skippedNoPhone} 件をスキップ）`}
            </p>
            {(importResult.assignedByPerson > 0 || importResult.assignedByCompany > 0) && (
              <p className="mt-1">
                担当者列による自動割り当て：個人一致 {importResult.assignedByPerson} 件 / 会社一致 {importResult.assignedByCompany} 件
              </p>
            )}
            {importResult.unmatchedHeaders.length > 0 && (
              <p className="mt-1 text-amber-700">認識できなかった列: {importResult.unmatchedHeaders.join(", ")}</p>
            )}
            {importResult.unmatchedAssignees.length > 0 && (
              <p className="mt-1 text-amber-700">
                担当者列で一致しなかった値（未割当のままです）: {importResult.unmatchedAssignees.join(", ")}
              </p>
            )}
          </div>
        )}

        {updateResult && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <p>
              {updateResult.total} 件中 {updateResult.updated} 件を更新しました
              {updateResult.unchanged > 0 && `（変更なしで ${updateResult.unchanged} 件はスキップ）`}
            </p>
            <p className="mt-1">
              {updateResult.notFound > 0 && `電話番号が一致せず見つからなかった行: ${updateResult.notFound} 件　`}
              {updateResult.ambiguous > 0 && `同じ電話番号の既存リードが複数あり対象外にした行: ${updateResult.ambiguous} 件　`}
              {updateResult.noPermission > 0 && `閲覧範囲外のため更新できなかった行: ${updateResult.noPermission} 件`}
            </p>
            {updateResult.skippedNoPhone > 0 && <p className="mt-1">電話番号なしでスキップ: {updateResult.skippedNoPhone} 件</p>}
            {(updateResult.assignedByPerson > 0 || updateResult.assignedByCompany > 0) && (
              <p className="mt-1">
                担当者列による自動割り当て：個人一致 {updateResult.assignedByPerson} 件 / 会社一致 {updateResult.assignedByCompany} 件
              </p>
            )}
            {updateResult.unmatchedHeaders.length > 0 && (
              <p className="mt-1 text-amber-700">認識できなかった列: {updateResult.unmatchedHeaders.join(", ")}</p>
            )}
            {updateResult.unmatchedAssignees.length > 0 && (
              <p className="mt-1 text-amber-700">
                担当者列で一致しなかった値（今の担当者のままです）: {updateResult.unmatchedAssignees.join(", ")}
              </p>
            )}
          </div>
        )}

        <button onClick={handleRun} disabled={isPending || !fileName} className={`self-start ${btnPrimaryCls}`}>
          {isPending ? "処理中…" : mode === "new" ? "インポート実行" : "更新インポート実行"}
        </button>
      </div>
    </div>
  );
}
