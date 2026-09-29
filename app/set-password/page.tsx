"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { btnPrimaryCls, errorCls, inputCls } from "@/lib/ui";

// 招待メールのリンクから来た人が、最初のログインパスワードを設定する画面。
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }
    if (password !== confirm) {
      setError("パスワードが一致しません。");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push("/leads");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-orange-100">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-600 text-lg font-bold text-white shadow-sm">
            C
          </span>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">コールトラッカー</h1>
          <p className="mt-1 text-sm text-slate-500">はじめに、ログイン用のパスワードを設定してください</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">新しいパスワード（8文字以上）</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">もう一度入力</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
            />
          </label>

          {error && <p className={errorCls}>{error}</p>}

          <button type="submit" disabled={pending} className={`${btnPrimaryCls} mt-2 w-full`}>
            {pending ? "設定中…" : "パスワードを設定してはじめる"}
          </button>
        </form>
      </div>
    </div>
  );
}
