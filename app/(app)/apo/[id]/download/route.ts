import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { apoFileName, normalizeApoData } from "@/lib/apoSheet";
import { XLSX_MIME, buildApoXlsx } from "@/lib/apoXlsx";

// 保存済みのアポ表を、Excel（.xlsx）としてダウンロードする。
// 閲覧できないアポ表は（行レベルセキュリティにより）取得できないので、404 を返す。
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const supabase = await createClient();
  const { data: sheet } = await supabase.from("apo_sheets").select("data").eq("id", id).maybeSingle();
  if (!sheet) return NextResponse.json({ error: "アポ表が見つかりません。" }, { status: 404 });

  const data = normalizeApoData(sheet.data);
  const buf = buildApoXlsx(data);
  const name = apoFileName(data);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="apo.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
