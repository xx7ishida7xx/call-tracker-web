import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// サーバー専用（Service Role Key を使う）Supabaseクライアント。
// RLS（行レベルセキュリティ）を完全にバイパスするため、
// 絶対にクライアントコンポーネントやブラウザに公開してはいけない。
// メンバー招待など、管理者だけが行える操作の Server Action からのみ呼び出すこと。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が設定されていません。Vercelの環境変数に追加してください。"
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
