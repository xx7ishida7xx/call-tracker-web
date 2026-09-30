"use client";

import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/app/actions";

// 自分自身のパスワードがわからなくなったとき用。ログイン画面の「パスワードをお忘れですか？」
// と同じ仕組み(本人のメール宛に再設定リンクを送るだけ)を、ログイン中の画面からも使えるようにする。
export default function SelfPasswordReset({ email, compact = false }: { email: string; compact?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        await requestPasswordReset(email);
        setSent(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "送信に失敗しました。");
      }
    });
  }

  if (sent) {
    return (
      <p className={compact ? "text-[11px] text-emerald-400" : "text-xs font-medium text-emerald-600"}>
        再設定メールを送信しました
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={send}
        disabled={isPending}
        className={
          compact
            ? "rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
            : "w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-orange-400 hover:text-orange-300"
        }
      >
        {isPending ? "送信中…" : "パスワードを再設定"}
      </button>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
