import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "コールトラッカー",
  description: "リード管理・架電管理システム",
};

export const viewport = {
  themeColor: "#ea580c",
  colorScheme: "light" as const,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-orange-50 text-slate-900">{children}</body>
    </html>
  );
}
