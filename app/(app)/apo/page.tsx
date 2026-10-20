import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { nameFor } from "@/lib/types";
import { normalizeApoData } from "@/lib/apoSheet";
import { btnPrimaryCls, btnSecondarySmCls, cardCls } from "@/lib/ui";

type CreatorRef = { name: string; display_name: string | null; email: string };
type SheetRow = {
  id: string;
  lead_id: string;
  created_by: string | null;
  data: unknown;
  updated_at: string;
  creator: CreatorRef | CreatorRef[] | null;
};

function fmtDate(iso: string): string {
  // 日本時間で「月/日 時:分」
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function ApoListPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  const supabase = await createClient();

  const { data } = await supabase
    .from("apo_sheets")
    .select("id,lead_id,created_by,data,updated_at,creator:profiles!apo_sheets_created_by_fkey(name,display_name,email)")
    .order("updated_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as SheetRow[];

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">アポ表</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            リードを選んでアポ表を作り、Excelでダウンロードするか、リードの添付に登録できます。
          </p>
        </div>
        <Link href="/apo/new" className={btnPrimaryCls}>
          ＋ 新しいアポ表を作る
        </Link>
      </div>

      <div className={`overflow-x-auto ${cardCls}`}>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">まだアポ表がありません。「新しいアポ表を作る」から作成できます。</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-100 text-[11px] font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-2.5">会社名</th>
                <th className="px-4 py-2.5">訪問日</th>
                <th className="px-4 py-2.5">営業担当</th>
                <th className="px-4 py-2.5">アポインター</th>
                <th className="px-4 py-2.5">作成者</th>
                <th className="px-4 py-2.5">更新</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const d = normalizeApoData(r.data);
                const creator = Array.isArray(r.creator) ? r.creator[0] : r.creator;
                return (
                  <tr key={r.id} className="hover:bg-orange-50/50">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                      <Link href={`/apo/${r.id}`} className="hover:text-orange-700 hover:underline">
                        {d.company || "（会社名未入力）"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">{d.visit_date ? d.visit_date.replace(/-/g, "/") : "-"}</td>
                    <td className="px-4 py-2.5 text-slate-700">{d.sales_rep || "-"}</td>
                    <td className="px-4 py-2.5 text-slate-700">{d.appointer || "-"}</td>
                    <td className="px-4 py-2.5 text-slate-700">{creator ? nameFor(creator) : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">{fmtDate(r.updated_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/apo/${r.id}`} className={btnSecondarySmCls}>
                          開く
                        </Link>
                        <a href={`/apo/${r.id}/download`} className={btnSecondarySmCls}>
                          Excel
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
