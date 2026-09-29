import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Component / Server Action / Route Handler から使う Supabase クライアント。
// ユーザーのログインセッション(Cookie)を引き継ぐので、RLS はそのユーザー権限で評価される。
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component のレンダー中に呼ばれた場合は書き込めない。
            // セッションの更新は middleware が担当するので無視して問題ない。
          }
        },
      },
    }
  );
}
