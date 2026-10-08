"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type IconName = "list" | "chart" | "users" | "upload" | "target" | "mail";

// badge：項目の右に赤い数字で出す件数（未読のメッセージなど。0や未指定なら出さない）
export type NavItem = { href: string; label: string; icon: IconName; group?: string; badge?: number };

function Badge({ count, className = "" }: { count?: number; className?: string }) {
  if (!count || count <= 0) return null;
  return (
    <span className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold leading-none text-white ${className}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (name) {
    case "list":
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19V9m6 10V5m6 14v-7" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 19v-1a4 4 0 0 0-2.5-3.7M14.5 3.3A3 3 0 0 1 15 9.2" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 9l5-5 5 5M12 4v12" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      );
  }
}

// デスクトップ用：縦型サイドバーのナビゲーション
// 「管理者メニュー」のようにグループ名が付いた項目は、直前と違うグループになったタイミングで
// 小見出しを表示し、スタッフ向け機能と管理者向け機能をひと目で区別できるようにしています。
export default function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {items.map((item, i) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const showGroupLabel = Boolean(item.group) && item.group !== items[i - 1]?.group;
        return (
          <div key={item.href}>
            {showGroupLabel && (
              <p className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 first:mt-2">
                {item.group}
              </p>
            )}
            <Link
              href={item.href}
              className={
                active
                  ? "flex items-center gap-3 rounded-lg bg-orange-500/15 px-3 py-2.5 text-sm font-semibold text-orange-300"
                  : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              }
            >
              <Icon name={item.icon} className={`h-[18px] w-[18px] shrink-0 ${active ? "text-orange-400" : "text-slate-400"}`} />
              {item.label}
              <Badge count={item.badge} className="ml-auto" />
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

// モバイル用：上部に横並びで表示するナビゲーション（グループが変わる箇所に区切り線を入れています）
export function TopBarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-2">
      {items.map((item, i) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const showDivider = i > 0 && Boolean(item.group) && item.group !== items[i - 1]?.group;
        return (
          <div key={item.href} className="flex shrink-0 items-center gap-1">
            {showDivider && <span className="mx-1 h-4 w-px shrink-0 bg-slate-700" aria-hidden />}
            <Link
              href={item.href}
              className={
                active
                  ? "flex shrink-0 items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1.5 text-xs font-semibold text-orange-300"
                  : "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              }
            >
              <Icon name={item.icon} className="h-3.5 w-3.5 shrink-0" />
              {item.label}
              <Badge count={item.badge} />
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
