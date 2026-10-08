"use client";

// リード詳細の「コメント」欄（通話履歴の下）。
// 前確の依頼・引き継ぎ（「◯◯さんに、△日の□時に連絡して」）や、前確した時の状況を、
// タイムスタンプ付きで全員に残せる。宛先を選ぶと、宛先の人の画面に未読の目印が出る。
import { useEffect, useRef, useState, useTransition } from "react";
import { addLeadComment, deleteLeadComment, markLeadCommentsRead } from "@/app/actions";
import { formatDateTime } from "@/lib/format";
import { btnPrimaryCls, cardCls, errorCls, inputCls, sectionTitleCls } from "@/lib/ui";

export type LeadCommentView = {
  id: string;
  author_id: string | null;
  author_name: string;
  to_profile_id: string | null;
  to_name: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type CommentRecipient = { id: string; name: string };

export default function LeadComments({
  leadId,
  leadStatus,
  comments,
  recipients,
  meId,
  isAdmin,
}: {
  leadId: string;
  leadStatus: string;
  comments: LeadCommentView[];
  recipients: CommentRecipient[];
  meId: string;
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");

  // 開いた時点で自分宛だった未読（開いた直後に既読にするので、この画面ではしばらく強調表示する）
  const unreadIdsRef = useRef<Set<string>>(
    new Set(comments.filter((c) => c.to_profile_id === meId && !c.read_at).map((c) => c.id))
  );
  const markedRef = useRef(false);

  useEffect(() => {
    if (markedRef.current) return;
    if (unreadIdsRef.current.size === 0) return;
    markedRef.current = true;
    markLeadCommentsRead(leadId).catch(() => {
      // 既読にできなくても、画面の表示には影響しない
    });
  }, [leadId]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError("コメントを入力してください。");
      return;
    }
    startTransition(async () => {
      try {
        await addLeadComment(leadId, body, to || null);
        setBody("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "送信に失敗しました。");
      }
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("このコメントを削除しますか？元に戻せません。")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteLeadComment(id, leadId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "削除に失敗しました。");
      }
    });
  }

  return (
    <section className={`${cardCls} p-5`}>
      <h2 className={`mb-1 ${sectionTitleCls}`}>コメント</h2>
      <p className="mb-4 text-xs text-slate-400">
        前確の依頼や引き継ぎ、前確した時の状況などを残せます。このリードを見られる人が読めます。宛先を選ぶと、その人の画面に未読の目印が出ます。
      </p>

      {leadStatus === "前確待ち" && (
        <p className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          このリードは「前確待ち」です。前確する人を宛先にして、「誰に・いつ連絡してほしいか」をコメントで残しておきましょう。
        </p>
      )}

      {comments.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">まだコメントがありません</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {comments.map((c) => {
            const mine = c.author_id === meId;
            const toMe = c.to_profile_id === meId;
            const wasUnread = unreadIdsRef.current.has(c.id);
            return (
              <li
                key={c.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  wasUnread
                    ? "border-orange-300 bg-orange-50"
                    : mine
                      ? "border-slate-200 bg-slate-50"
                      : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{c.author_name}</span>
                  {c.to_name && (
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${toMe ? "bg-orange-100 text-orange-700" : "bg-indigo-100 text-indigo-700"}`}>
                      {toMe ? "あなた宛" : `${c.to_name}さん宛`}
                    </span>
                  )}
                  {wasUnread && <span className="rounded-full bg-orange-500 px-2 py-0.5 font-semibold text-white">新着</span>}
                  <span>{formatDateTime(c.created_at)}</span>
                  {c.to_name && c.read_at && !toMe && <span className="text-slate-400">（{c.to_name}さん既読）</span>}
                  {(mine || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={isPending}
                      className="ml-auto text-xs font-medium text-slate-400 hover:text-rose-600"
                    >
                      削除
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleSend} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-600" htmlFor={`comment-to-${leadId}`}>
            宛先
          </label>
          <select id={`comment-to-${leadId}`} value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} max-w-56`}>
            <option value="">全体（宛先なし）</option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}さん宛
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="例：橋本さん、明日15時に代表の◯◯様へ前確の連絡をお願いします。"
          className={inputCls}
        />
        {error && <p className={errorCls}>{error}</p>}
        <button type="submit" disabled={isPending} className={`self-start ${btnPrimaryCls}`}>
          {isPending ? "送信中…" : "コメントを送る"}
        </button>
      </form>
    </section>
  );
}
