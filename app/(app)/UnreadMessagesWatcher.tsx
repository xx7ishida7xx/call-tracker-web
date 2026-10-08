"use client";

// 自分宛の新着コメントが届いたら、画面上にポップアップで知らせるコンポーネント。
// 画面を開いている間、1分おきに自分宛の未読件数を確認し、増えていたらお知らせして、
// 左メニューの未読の数字も更新する。
// ※ このアプリの画面を開いている間だけ動作する簡易的な仕組みです（ブラウザのプッシュ通知ではありません）。
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 60_000;

export default function UnreadMessagesWatcher({ meId, initialCount }: { meId: string; initialCount: number }) {
  const router = useRouter();
  const lastCountRef = useRef(initialCount);
  const [toast, setToast] = useState<number | null>(null);

  // サーバー側で再取得された最新の件数に追従する（リード詳細を開いて既読になった場合など）
  useEffect(() => {
    lastCountRef.current = initialCount;
  }, [initialCount]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function check() {
      const { count, error } = await supabase
        .from("lead_comments")
        .select("id", { count: "exact", head: true })
        .eq("to_profile_id", meId)
        .is("read_at", null);
      if (cancelled || error || count === null) return;
      if (count > lastCountRef.current) setToast(count);
      if (count !== lastCountRef.current) {
        lastCountRef.current = count;
        router.refresh();
      }
    }

    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [meId, router]);

  if (toast === null) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex w-[calc(100vw-2rem)] max-w-80 flex-col gap-1.5 rounded-xl border border-rose-200 bg-white p-3 shadow-lg shadow-rose-100/50 sm:left-64">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-rose-600">自分宛の新着メッセージがあります</p>
        <button
          type="button"
          onClick={() => setToast(null)}
          className="leading-none text-slate-400 hover:text-slate-600"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <p className="text-sm text-slate-700">未読が {toast} 件あります。</p>
      <Link
        href="/messages"
        onClick={() => setToast(null)}
        className="text-xs font-semibold text-orange-600 hover:underline"
      >
        メッセージを確認する →
      </Link>
    </div>
  );
}
