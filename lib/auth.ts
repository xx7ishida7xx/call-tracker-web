import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// 現在ログイン中のユーザーの profiles 行を取得する（未ログインなら null）。
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}
