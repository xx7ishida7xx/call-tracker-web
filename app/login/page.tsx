"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "@/app/actions";
import { btnPrimaryCls, errorCls, inputCls } from "@/lib/ui";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, undefined);

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
          <h1 className="text-xl font-bold tracking-tight text-slate-900">SamuraiONコールトラッカー</h1>
          <p className="mt-1 text-sm text-slate-500">メールアドレスとパスワードでログイン</p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">メールアドレス</span>
            <input type="email" name="email" required autoComplete="email" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">パスワード</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </label>

          {state?.error && <p className={errorCls}>{state.error}</p>}

          <button type="submit" disabled={pending} className={`${btnPrimaryCls} mt-2 w-full`}>
            {pending ? "ログイン中…" : "ログイン"}
          </button>
        </form>

        <Link
          href="/forgot-password"
          className="mt-4 block text-center text-xs font-medium text-slate-500 hover:text-orange-600 hover:underline"
        >
          パスワードをお忘れですか？
        </Link>
      </div>
    </div>
  );
}
