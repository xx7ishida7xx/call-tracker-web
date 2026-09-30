import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// 招待メール・パスワード再設定メールのリンクから戻ってくる場所（新方式）。
//
// 以前は Supabase の /auth/v1/verify が発行する「code」を
// exchangeCodeForSession で交換する方式（PKCE）を使っていたが、
// この方式は「本人が自分のブラウザで操作を始めた場合」専用の仕組みで、
// 「管理者が別の人のために代わりに送るリンク」（招待・パスワード再設定）
// では、コード交換に必要な鍵が管理者側のブラウザにしか無いため、
// 受け取った本人のブラウザでは必ず失敗してしまっていた。
//
// token_hash + verifyOtp を使うこの方式は、リンクをクリックした
// ブラウザ側だけで完結して認証できるため、管理者が代わりに送った
// リンクでも問題なく動作する（Supabase公式が推奨する方式）。
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/leads";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invite_link_invalid`);
}
