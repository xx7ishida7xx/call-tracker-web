import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { nameFor } from "@/lib/types";
import { rowsToCsvText } from "@/lib/csv";

// リード一覧のCSVエクスポート（全件）。
//
// 列構成はCSVインポートが読み取れる列と完全に一致させている
// （会社名・都道府県・住所・電話番号・メールアドレス・URL・元CMS・業種・業種詳細・担当者）。
// これにより、エクスポート→一部の行だけ直す／担当者欄を埋める→
// 「更新インポート」でそのまま読み込み直す、という使い方ができる
// （updateLeadsCsv は電話番号が一致した既存リードだけを更新し、空欄のセルは変更しない）。
//
// 件数が多い（15,000件超）ため、Supabase/PostgRESTの1回あたりの取得上限
// （既定1,000件）を超えないよう、rangeで区切って繰り返し取得する。
export async function GET() {
  const me = await getCurrentProfile();
  if (!me) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (me.role !== "admin" && me.role !== "teamlead") {
    return NextResponse.json({ error: "CSVエクスポートは、管理者・チームリーダーのみ行えます。" }, { status: 403 });
  }

  const supabase = await createClient();

  type ExportRow = {
    company: string;
    pref: string;
    address: string;
    phone: string;
    email: string;
    url: string;
    cms: string;
    genre: string;
    subgenre: string;
    hp_status: string;
    assigned: { name: string; display_name: string | null; email: string } | { name: string; display_name: string | null; email: string }[] | null;
  };

  const PAGE_SIZE = 1000;
  const allRows: ExportRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("leads")
      .select(
        "company,pref,address,phone,email,url,cms,genre,subgenre,hp_status,assigned:profiles!leads_assigned_to_fkey(name,display_name,email)"
      )
      .order("created_at", { ascending: true })
      // 同じ登録日時の行の並びを固定する（1,000件ずつ取得するため、並びが揺れると重複・欠落が起きる）
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = (data as unknown as ExportRow[]) ?? [];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  const headerRow = ["会社名", "都道府県", "住所", "電話番号", "メールアドレス", "URL", "元CMS", "業種", "業種詳細", "担当者", "HPの状態"];
  const csvRows = allRows.map((r) => {
    const assignedProfile = Array.isArray(r.assigned) ? r.assigned[0] : r.assigned;
    return [
      r.company,
      r.pref,
      r.address,
      r.phone,
      r.email,
      r.url,
      r.cms,
      r.genre,
      r.subgenre,
      assignedProfile ? nameFor(assignedProfile) : "",
      r.hp_status,
    ];
  });

  const csvText = rowsToCsvText(headerRow, csvRows);
  const today = new Date();
  const filename = `leads_export_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}.csv`;

  return new NextResponse(csvText, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
