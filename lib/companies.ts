// 会社マスタ（companies テーブル）用のヘルパー。
// 自社（ミライアゴーゴー）を先頭に、それ以外は名前順で返す。

import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface Company {
  id: string;
  name: string;
  display_name: string | null;
  is_home: boolean;
}

export async function getCompanies(supabase: SupabaseClient): Promise<Company[]> {
  const { data } = await supabase.from("companies").select("id, name, display_name, is_home").order("name");
  const rows = (data as Company[]) ?? [];
  return rows.sort((a, b) => Number(b.is_home) - Number(a.is_home) || a.name.localeCompare(b.name, "ja"));
}

// 一覧やセレクトボックスでの表示用：表示名称が設定されていれば「表示名称（正式名称）」、
// なければ正式名称のみを表示する
export function companyLabel(c: Pick<Company, "name" | "display_name">): string {
  return c.display_name && c.display_name.trim() ? `${c.display_name}（${c.name}）` : c.name;
}
