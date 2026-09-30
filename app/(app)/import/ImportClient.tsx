"use client";

import { useRef, useState, useTransition } from "react";
import { importLeadsCsv } from "@/app/actions";
import { nameFor, type Profile } from "@/lib/types";
import { btnPrimaryCls, cardCls, errorCls, inputCls } from "@/lib/ui";

type Result = {
  total: number;
  imported: number;
  skippedDuplicate: number;
  unmatchedHeaders: string[];
  assignedByPerson: number;
  assignedByCompany: number;
  unmatchedAssignees: string[];
};

export default function ImportClient({ me, roster }: { me: Profile; roster: Profile[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("CSVファイルを選択してください。");
      return;
    }
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      startTransition(async () => {
        try {
          const r = await importLeadsCsv(text, assignTo || null);
          setResult(r);
          if (fileRef.current) fileRef.current.value = "";
          setFileName("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "インポートに失敗しました。");
        }
      });
    };
    reader.onerror = () => setError("ファイルの読み込みに失敗しました。");
    reader.readAsText(file, "utf-8");
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">CSVインポート</h1>
        <p className="mt-1 text-sm text-slate-500">
          列名は「会社名, 都道府県, 住所, 電話番号, メールアドレス, URL, 元CMS, 業種, 業種詳細, 担当者」に対応しています(順不同)。
          既存の電話番号と一致する行は自動的にスキップされます。
        </p>
        {(me.role === "admin" || me.role === "teamlead") && (
          <p className="mt-2 rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-xs text-slate-600">
            「担当者」列には、担当させたい人の表示名・登録名・メールアドレスのいずれか、または担当させたいゲスト会社名(「会社の管理」で登録した名前と完全一致)を入れておくと、行ごとに自動で割り当てます。
            会社名を入れた行は、その会社のゲスト管理者に割り当てられます(後で振り分け直してください)。
            一致しない・空欄の行は、下で選んだ担当者(未選択なら未割当)になります。
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

        {roster.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              今回インポートする分の担当者をまとめて指定(任意)
            </span>
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
        {me.role === "teamlead" && (
          <p className="text-xs text-slate-500">
            チームリーダーとしてインポートすると、リードは自分に割り当てられます。
          </p>
        )}

        {error && <p className={errorCls}>{error}</p>}
        {result && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <p>
              {result.total} 件中 {result.imported} 件を取り込みました
              {result.skippedDuplicate > 0 && `(電話番号重複で ${result.skippedDuplicate} 件をスキップ)`}
            </p>
            {(result.assignedByPerson > 0 || result.assignedByCompany > 0) && (
              <p className="mt-1">
                担当者列による自動割り当て:個人一致 {result.assignedByPerson} 件 / 会社一致 {result.assignedByCompany} 件
              </p>
            )}
            {result.unmatchedHeaders.length > 0 && (
              <p className="mt-1 text-amber-700">
                認識できなかった列: {result.unmatchedHeaders.join(", ")}
              </p>
            )}
            {result.unmatchedAssignees.length > 0 && (
              <p className="mt-1 text-amber-700">
                担当者列で一致しなかった値(未割当のままです): {result.unmatchedAssignees.join(", ")}
              </p>
            )}
          </div>
        )}

        <button onClick={handleImport} disabled={isPending || !fileName} className={`self-start ${btnPrimaryCls}`}>
          {isPending ? "取り込み中…" : "インポート実行"}
        </button>
      </div>
    </div>
  );
}
