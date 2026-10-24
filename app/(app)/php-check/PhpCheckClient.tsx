"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { cardCls, btnPrimaryCls, btnSecondaryCls, sectionTitleCls, errorCls } from "@/lib/ui";
import { PHP_STATUSES, PHP_STATUS_BADGE_CLS } from "@/lib/phpStatus";
import { runPhpCheckBatch, getPhpOverview, type PhpOverview } from "./actions";

export default function PhpCheckClient({ overview: initial }: { overview: PhpOverview }) {
  const [overview, setOverview] = useState(initial);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [target, setTarget] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const stopRef = useRef(false);

  async function run(mode: "unchecked" | "all" | "private") {
    if (mode === "all" && !window.confirm("判定済みも含めて、全件をやり直します。よろしいですか？")) return;
    stopRef.current = false;
    setRunning(true);
    setError("");
    setMessage("");
    setDone(0);
    setTarget(mode === "unchecked" ? overview.unchecked : mode === "private" ? (overview.byStatus["非公開"] ?? 0) : overview.withUrl);
    let cursor: string | null = null;
    let total = 0;
    let fails = 0;
    try {
      while (!stopRef.current) {
        let r;
        try {
          r = await runPhpCheckBatch(mode, cursor);
          fails = 0;
        } catch (e) {
          // 一時的な失敗は数回やり直す
          fails++;
          if (fails >= 3) throw e;
          continue;
        }
        total += r.processed;
        cursor = r.cursor;
        setDone(total);
        if (r.processed === 0 || r.remaining === 0) break;
      }
      setMessage(stopRef.current ? `停止しました（${total}件を判定）` : `完了しました（${total}件を判定）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setRunning(false);
      try {
        setOverview(await getPhpOverview());
      } catch {
        /* 無視 */
      }
    }
  }

  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-bold">PHPバージョン判定</h1>
      <div className={`${cardCls} space-y-3 p-4 text-sm`}>
        <p>
          リードのURL（ホームページ）にアクセスし、サイトが公開しているPHPのバージョンを読み取って、リードに保存します。
          結果は「外部から確認できた範囲」です。最終確認は、お客様のサーバー管理画面で行ってください。
        </p>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          <li>実行中は、このページを開いたままにしてください（閉じると止まります。続きからやり直せます）。</li>
          <li>20件ずつ、同時に10件まで調べます。1万件で、目安は2〜3時間です。</li>
          <li>ヘッダーを隠しているサイトは「非公開」になります（PHPでないという意味ではありません）。WordPressと分かり、本体が古い（6.0より前）場合は「推定古い」と表示します（推定。確定ではありません）。</li>
        </ul>
      </div>

      <div className={`${cardCls} space-y-3 p-4`}>
        <h2 className={sectionTitleCls}>現在の状況</h2>
        <div className="text-sm">
          リード全体 {overview.total.toLocaleString()}件 ／ URLあり {overview.withUrl.toLocaleString()}件 ／ 未判定{" "}
          <b>{overview.unchecked.toLocaleString()}件</b>
        </div>
        <div className="flex flex-wrap gap-2">
          {PHP_STATUSES.map((s) => (
            <span key={s} className={`rounded-full px-3 py-1 text-[13.7px] font-medium ${PHP_STATUS_BADGE_CLS[s]}`}>
              {s} {(overview.byStatus[s] ?? 0).toLocaleString()}
            </span>
          ))}
        </div>
        <Link href="/leads" className="text-sm text-orange-700 underline">
          リード一覧で見る（「PHP判定」で絞り込み）
        </Link>
      </div>

      <div className={`${cardCls} space-y-3 p-4`}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimaryCls} disabled={running || overview.unchecked === 0} onClick={() => run("unchecked")}>
            未判定を判定する
          </button>
          <button type="button" className={btnSecondaryCls} disabled={running || (overview.byStatus["非公開"] ?? 0) === 0} onClick={() => run("private")}>
            非公開をWordPressの手がかりで再判定
          </button>
          <button type="button" className={btnSecondaryCls} disabled={running} onClick={() => run("all")}>
            全件をやり直す
          </button>
          {running && (
            <button type="button" className={btnSecondaryCls} onClick={() => (stopRef.current = true)}>
              停止
            </button>
          )}
        </div>
        {(running || done > 0) && (
          <div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[13.7px] text-slate-600">
              {done.toLocaleString()} / {target.toLocaleString()}件 {running && "（実行中…）"}
            </div>
          </div>
        )}
        {message && <div className="text-sm text-emerald-700">{message}</div>}
        {error && <div className={errorCls}>{error}</div>}
      </div>
    </div>
  );
}
