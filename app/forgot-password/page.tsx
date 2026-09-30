"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";
import { btnPrimaryCls, btnSecondaryCls, errorCls, inputCls, successCls } from "@/lib/ui";

// ログイン画面の「パスワードをお忘れですか？」から来る画面。
// メールアドレスを入力すると、Supabaseから再設定用のメールが届き、
// 本人がそのリンクから新しいパスワードを設定できる（/set-password と同じ仕組み）。
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-orange-100">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/samurai-on.png"
            alt="サムライオン"
            className="mb-3 h-11 w-11 rounded-xl bg-orange-600 object-cover shadow-sm"
          />
          <h1 className="text-xl font-bold tracking-tight text-slate-900">パスワードの再設定</h1>
          <p className="mt-1 text-sm text-slate-500">
            登録済みのメールアドレスを入力してください。再設定用のリンクをお送りします。
          </p>
        </div>

        {sent ? (
          <div className="flex flex-col gap-4">
            <p className={successCls}>
              {email} 宛に再設定用のメールを送信しました。メール内のリンクから、新しいパスワードを設定してください。
            </p>
            <Link href="/login" className={`${btnSecondaryCls} w-full`}>
              ログイン画面に戻る
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">メールアドレス</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </label>

            {error && <p className={errorCls}>{error}</p>}

            <button type="submit" disabled={pending || !email} className={`${btnPrimaryCls} mt-2 w-full`}>
              {pending ? "送信中…" : "再設定メールを送る"}
            </button>
            <Link href="/login" className="text-center text-xs font-medium text-slate-500 hover:text-orange-600 hover:underline">
              ログイン画面に戻る
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
