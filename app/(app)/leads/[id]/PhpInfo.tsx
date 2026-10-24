"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkLeadPhp } from "@/app/(app)/php-check/actions";
import { PHP_STATUS_BADGE_CLS } from "@/lib/phpStatus";
import { formatDateTime } from "@/lib/format";
import { btnSecondarySmCls } from "@/lib/ui";

// リード詳細：PHPバージョン判定の結果と「いますぐ判定」ボタン
export default function PhpInfo({
  leadId,
  version,
  status,
  note,
  checkedAt,
  hasUrl,
}: {
  leadId: string;
  version: string;
  status: string;
  note: string;
  checkedAt: string | null;
  hasUrl: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  function run() {
    setErr("");
    start(async () => {
      const r = await checkLeadPhp(leadId);
      if (!r.ok) setErr(r.error ?? "判定できませんでした");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {status ? (
          <span className={`rounded-full px-2.5 py-0.5 text-[13.7px] font-medium ${PHP_STATUS_BADGE_CLS[status] ?? "bg-slate-100 text-slate-500"}`}>
            {version ? `PHP ${version} ` : ""}
            {status}
          </span>
        ) : (
          <span className="text-slate-400">未判定</span>
        )}
        <button type="button" className={btnSecondarySmCls} disabled={pending || !hasUrl} onClick={run}>
          {pending ? "判定中…" : "いますぐ判定"}
        </button>
        {checkedAt && <span className="text-[13.7px] text-slate-400">確認日 {formatDateTime(checkedAt)}</span>}
      </div>
      {note && <div className="text-[13.7px] text-slate-500">{note}</div>}
      <div className="text-[13.7px] text-slate-400">※外部から確認できた範囲の判定です。最終確認はサーバー管理画面で行ってください。</div>
      {err && <div className="text-[13.7px] text-red-600">{err}</div>}
    </div>
  );
}
