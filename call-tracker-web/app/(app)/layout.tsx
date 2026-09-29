import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, nameFor, ROLE_LABEL } from "@/lib/types";
import { signOut } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const canManage = canManageMembers(me);
  const canImport = me.role === "admin" || me.role === "teamlead";

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-base font-bold text-slate-900">コールトラッカー</span>
          <nav className="flex flex-wrap gap-4 text-sm text-slate-600">
            <Link href="/leads" className="hover:text-slate-900">
              リード一覧
            </Link>
            {canManage && (
              <Link href="/dashboard" className="hover:text-slate-900">
                ダッシュボード
              </Link>
            )}
            {canManage && (
              <Link href="/members" className="hover:text-slate-900">
                メンバー管理
              </Link>
            )}
            {canImport && (
              <Link href="/import" className="hover:text-slate-900">
                CSVインポート
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span>
              {nameFor(me)}
              <span className="ml-1 text-xs text-slate-400">
                ・{me.is_owner ? "オーナー" : ROLE_LABEL[me.role]}
              </span>
            </span>
            <form action={signOut}>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
