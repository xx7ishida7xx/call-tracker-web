import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { btnAccentCls, btnPrimaryCls, btnSecondarySmCls, cardCls, inputCls } from "@/lib/ui";
import { createApoSheet } from "../actions";

type LeadRow = { id: string; company: string; phone: string; address: string; status: string };

// 新しいアポ表を作るリードを選ぶページ（会社名・電話番号で検索。リード詳細から ?lead=ID で来た場合はそのリード）
export default async function NewApoPage({ searchParams }: { searchParams: Promise<{ q?: string; lead?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentProfile();
  if (!me) return null;
  const supabase = await createClient();

  const q = (sp.q ?? "").trim().replace(/[%,]/g, "");
  let leads: LeadRow[] = [];
  if (sp.lead) {
    const { data } = await supabase.from("leads").select("id,company,phone,address,status").eq("id", sp.lead).limit(1);
    leads = (data ?? []) as LeadRow[];
  } else if (q) {
    const digits = q.replace(/[^0-9]/g, "");
    const filter = digits.length >= 4 ? `company.ilike.%${q}%,phone.ilike.%${digits}%` : `company.ilike.%${q}%`;
    const { data } = await supabase
      .from("leads")
      .select("id,company,phone,address,status")
      .or(filter)
      .order("created_at", { ascending: false })
      .limit(30);
    leads = (data ?? []) as LeadRow[];
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/apo" className="text-[13.7px] font-semibold text-slate-500 hover:text-orange-700">
          ← アポ表の一覧へ
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">新しいアポ表を作る</h1>
        <p className="mt-0.5 text-[13.7px] text-slate-500">アポ表を作るリードを選んでください。選んだリードの情報が入力欄に入った状態で開きます。</p>
      </div>

      {!sp.lead && (
        <form method="get" className={`flex flex-wrap items-end gap-2 p-4 ${cardCls}`}>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-[13.7px] font-semibold text-slate-500">
            会社名・電話番号で検索
            <input name="q" defaultValue={sp.q ?? ""} placeholder="例：花季 / 047-482" className={inputCls} autoFocus />
          </label>
          <button type="submit" className={btnAccentCls}>
            検索
          </button>
        </form>
      )}

      {(sp.q || sp.lead) && (
        <div className={`divide-y divide-slate-100 ${cardCls}`}>
          {leads.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">該当するリードが見つかりません（閲覧できるリードだけが表示されます）。</p>
          ) : (
            leads.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{l.company || "（会社名なし）"}</p>
                  <p className="truncate text-[13.7px] text-slate-500">
                    {l.phone}　{l.address}　［{l.status}］
                  </p>
                </div>
                <Link href={`/leads/${l.id}`} className={btnSecondarySmCls} target="_blank">
                  リードを見る
                </Link>
                <form action={createApoSheet.bind(null, l.id)}>
                  <button type="submit" className={btnPrimaryCls}>
                    このリードで作る
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
