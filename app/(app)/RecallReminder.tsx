"use client";

// 次回架電予定（再コール含む）が近づいたら、担当者の画面上にポップアップで知らせるコンポーネント。
// ※ このアプリの画面を開いている間だけ動作する簡易的な仕組みです（ブラウザのプッシュ通知ではありません）。
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

type ReminderLead = {
  id: string;
  company: string;
  recall_at: string;
  recall_target: string | null;
};

const POLL_INTERVAL_MS = 60_000; // 1分おきに確認
const LOOKAHEAD_MS = 10 * 60_000; // 予定時刻の10分前から知らせる
const GRACE_MS = 2 * 60_000; // タブが非アクティブだった場合などを考慮し、少し過ぎたものも拾う

function storageKey(meId: string) {
  return `call-tracker:recall-reminder-seen:${meId}`;
}

function loadSeen(meId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(meId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(meId: string, seen: Set<string>) {
  try {
    localStorage.setItem(storageKey(meId), JSON.stringify(Array.from(seen)));
  } catch {
    // localStorageが使えない環境（プライベートモード等）では何もしない。
    // その場合、同じ予定を再度お知らせしてしまうことがあるが実害はないため許容する。
  }
}

export default function RecallReminder({ meId }: { meId: string }) {
  const [toasts, setToasts] = useState<ReminderLead[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!meId) return;
    seenRef.current = loadSeen(meId);
    const supabase = createClient();
    let cancelled = false;

    async function check() {
      const now = Date.now();
      const from = new Date(now - GRACE_MS).toISOString();
      const to = new Date(now + LOOKAHEAD_MS).toISOString();
      const { data, error } = await supabase
        .from("leads")
        .select("id, company, recall_at, recall_target")
        .eq("assigned_to", meId)
        .not("recall_at", "is", null)
        .gte("recall_at", from)
        .lte("recall_at", to);

      if (cancelled || error || !data) return;

      const seen = seenRef.current;
      const fresh: ReminderLead[] = [];
      for (const lead of data as ReminderLead[]) {
        const key = `${lead.id}:${lead.recall_at}`;
        if (!seen.has(key)) {
          seen.add(key);
          fresh.push(lead);
        }
      }
      if (fresh.length > 0) {
        saveSeen(meId, seen);
        setToasts((t) => [...t, ...fresh]);
      }
    }

    check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [meId]);

  function dismiss(id: string, recallAt: string) {
    setToasts((t) => t.filter((x) => !(x.id === id && x.recall_at === recallAt)));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-80 flex-col gap-2">
      {toasts.map((lead) => (
        <div
          key={`${lead.id}:${lead.recall_at}`}
          className="flex flex-col gap-1.5 rounded-xl border border-orange-200 bg-white p-3 shadow-lg shadow-orange-100/50"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-orange-600">次回架電のお知らせ</p>
            <button
              type="button"
              onClick={() => dismiss(lead.id, lead.recall_at)}
              className="leading-none text-slate-400 hover:text-slate-600"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
          <p className="text-sm font-semibold text-slate-900">{lead.company || "（会社名未登録）"}</p>
          <p className="text-xs text-slate-500">
            予定: {formatDateTime(lead.recall_at)}
            {lead.recall_target ? `（${lead.recall_target}）` : ""}
          </p>
          <Link
            href={`/leads/${lead.id}`}
            className="mt-1 self-start rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-700"
          >
            リードを開く
          </Link>
        </div>
      ))}
    </div>
  );
}
