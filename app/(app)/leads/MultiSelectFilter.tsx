"use client";

import { useEffect, useRef, useState } from "react";
import { inputCls } from "@/lib/ui";

// 業種・都道府県のように選択肢が多い項目を、チェックボックスで複数選べるようにする
// 絞り込み用ドロップダウン。
//
// 以前は <details> 要素（JavaScript不要）で実装していたが、
// 1) 他の場所をクリックしても閉じない（▼をもう一度押すか、検索ボタンを押すまで開いたまま）
// 2) 選択件数の表示（「すべて」→「2件選択中」など）がチェックした瞬間には変わらず、
//    実際に検索を実行するまで反映されない
// という使い勝手の問題があったため、クリック状態をJavaScriptで管理する方式に変更した。
export default function MultiSelectFilter({
  label,
  name,
  options,
  selected,
}: {
  label: string;
  name: string;
  options: readonly string[];
  selected: string[];
}) {
  const [open, setOpen] = useState(false);
  const [checkedValues, setCheckedValues] = useState<string[]>(selected);
  const containerRef = useRef<HTMLDivElement>(null);

  // ドロップダウンの外側をクリックしたら閉じる
  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  function toggleValue(value: string, isChecked: boolean) {
    setCheckedValues((prev) => (isChecked ? [...prev, value] : prev.filter((v) => v !== value)));
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
      {label}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`${inputCls} flex w-40 cursor-pointer select-none items-center justify-between gap-2`}
        >
          <span className="truncate">
            {checkedValues.length === 0 ? "すべて" : `${checkedValues.length}件選択中`}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm font-normal text-slate-700 hover:bg-orange-50"
              >
                <input
                  type="checkbox"
                  name={name}
                  value={opt}
                  checked={checkedValues.includes(opt)}
                  onChange={(e) => toggleValue(opt, e.target.checked)}
                  className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                {opt}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
