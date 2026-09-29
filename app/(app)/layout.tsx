import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers, nameFor, ROLE_LABEL } from "@/lib/types";
import { signOut } from "@/app/actions";
import Sidebar, { TopBarNav, type NavItem } from "./NavBar";
import RecallReminder from "./RecallReminder";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const canManage = canManageMembers(me);
  const canImport = me.role === "admin" || me.role === "teamlead";

  // 「管理者メニュー」はオーナー・管理者だけに表示されるグループです。
  // スタッフ用の画面と管理者用の画面がサイドバー上でひと目で区別できるようにしています。
  const navItems: NavItem[] = [
    { href: "/leads", label: "リード一覧", icon: "list" },
    ...(canImport ? [{ href: "/import", label: "CSVインポート", icon: "upload" as const, group: "データ管理" }] : []),
    ...(canManage
      ? [
          { href: "/dashboard", label: "ダッシュボード", icon: "chart" as const, group: "管理者メニュー" },
          { href: "/members", label: "メンバー管理", icon: "users" as const, group: "管理者メニュー" },
        ]
      : []),
  ];

  const roleLabel = me.is_owner ? "オーナー" : ROLE_LABEL[me.role];

  return (
    <div className="min-h-screen bg-orange-50 sm:flex">
      {/* デスクトップ：左側の縦型ナビゲーション（濃色） */}
      <aside className="hidden sm:sticky sm:top-0 sm:flex sm:h-screen sm:w-60 sm:shrink-0 sm:flex-col sm:bg-slate-900">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-sm font-bold text-white shadow-sm">
            C
          </span>
          <span className="text-base font-bold tracking-tight text-white">コールトラッカー</span>
        </div>

        <Sidebar items={navItems} />

        <div className="mt-auto flex flex-col gap-3 border-t border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-white">
              {nameFor(me).slice(0, 1)}
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium text-slate-100">{nameFor(me)}</span>
              <span className="text-slate-400">{roleLabel}</span>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-orange-400 hover:text-orange-300"
            >
              ログアウト
            </button>
          </form>
        </div>
      </aside>

      {/* モバイル：上部バー（濃色） */}
      <header className="sticky top-0 z-10 flex flex-col bg-slate-900 sm:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-sm font-bold text-white shadow-sm">
            C
          </span>
          <span className="truncate text-sm font-bold tracking-tight text-white">コールトラッカー</span>
          <span className="ml-1 truncate text-[11px] text-slate-400">
            {nameFor(me)}・{roleLabel}
          </span>
          <form action={signOut} className="ml-auto shrink-0">
            <button
              type="submit"
              className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
            >
              ログアウト
            </button>
          </form>
        </div>
        <TopBarNav items={navItems} />
      </header>

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>

      <RecallReminder meId={me.id} />
    </div>
  );
}
