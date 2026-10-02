import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ゲスト（販売店）アカウントが、自動ツール・AIエージェントなどを使って
// リード一覧・リード詳細ページを短時間に機械的に大量アクセスし、本来の
// 利用範囲を超えてデータを一括で抜き出すことを防ぐための、簡易レート制限。
//
// 通常の人間の操作（フィルタを変えて検索し直す、架電結果を見ながら次々と
// リード詳細を開く、など）では到達しない程度に、十分余裕を持たせたしきい値に
// している。社内メンバー（管理者・チームリーダー・スタッフ）の通常業務には
// 影響させないよう、呼び出し側でゲストロールにのみ使うこと。
//
// 実際のカウント・判定は Supabase 側の check_rate_limit() 関数（migration 0018）
// で行っている（1回のDB呼び出しで記録と判定を両方行い、通信回数を抑えるため）。
export async function checkGuestRateLimit(
  supabase: SupabaseClient,
  route: string,
  opts: { windowSeconds: number; maxRequests: number }
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_route: route,
    p_window_seconds: opts.windowSeconds,
    p_max_requests: opts.maxRequests,
  });
  if (error) {
    // レート制限の仕組み自体に問題があっても、通常の利用を止めてしまわないよう、
    // エラー時は「制限にかかっていない」扱いにする（fail open）。
    console.error("checkGuestRateLimit error:", error.message);
    return true;
  }
  return data === true;
}
