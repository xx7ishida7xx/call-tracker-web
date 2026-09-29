"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

export default function NavBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-full bg-orange-50 px-3 py-1.5 font-semibold text-orange-700"
                : "rounded-full px-3 py-1.5 text-slate-600 transition hover:bg-slate-50 hover:text-orange-600"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
