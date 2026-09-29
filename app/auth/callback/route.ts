import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 招待メール・パスワード再設定メールのリンクから戻ってくる場所。
// Supabaseから渡された code をセッションに交換し、続きのページへ進む。
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/leads";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invite_link_invalid`);
}
