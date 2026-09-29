import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, nameFor, ROLE_LABEL } from "@/lib/types";
import { signOut } from "@/app/actions";
import { btnSecondarySmCls } from "@/lib/ui";
import NavBar from "./NavBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const canManage = canManageMembers(me);
  const canImport = me.role === "admin" || me.role === "teamlead";

  const navItems = [
    { href: "/leads", label: "リード一覧" },
    ...(canManage ? [{ href: "/dashboard", label: "ダッシュボード" }] : []),
    ...(canManage ? [{ href: "/members", label: "メンバー管理" }] : []),
    ...(canImport ? [{ href: "/import", label: "CSVインポート" }] : []),
  ];

  return (
    <div className="min-h-screen bg-orange-50/40">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="h-1 w-full bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-sm font-bold text-white shadow-sm">
              C
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">コールトラッカー</span>
          </span>
          <NavBar items={navItems} />
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 sm:inline-flex">
              {nameFor(me)}
              <span className="text-orange-400">・</span>
              {me.is_owner ? "オーナー" : ROLE_LABEL[me.role]}
            </span>
            <form action={signOut}>
              <button type="submit" className={btnSecondarySmCls}>
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
