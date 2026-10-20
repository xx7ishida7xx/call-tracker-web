import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { normalizeApoData } from "@/lib/apoSheet";
import ApoForm from "./ApoForm";

export default async function ApoSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentProfile();
  if (!me) return null;
  const supabase = await createClient();

  const { data: sheet } = await supabase.from("apo_sheets").select("id,lead_id,created_by,data").eq("id", id).maybeSingle();
  if (!sheet) notFound();

  const data = normalizeApoData(sheet.data);
  const canEdit = me.role === "admin" || sheet.created_by === me.id;

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/apo" className="text-xs font-semibold text-slate-500 hover:text-orange-700">
            ← アポ表の一覧へ
          </Link>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">アポ表：{data.company || "（会社名未入力）"}</h1>
        </div>
      </div>
      {!canEdit && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          このアポ表は、作成した本人か管理者のみ編集できます（Excelのダウンロードはできます）。
        </p>
      )}
      <ApoForm sheetId={sheet.id} leadId={sheet.lead_id} initial={data} canDelete={canEdit} />
    </div>
  );
}
