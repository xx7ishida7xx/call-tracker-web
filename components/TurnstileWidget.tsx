"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile（人かボットかを確認する、画面に出る小さな確認パーツ）を
// 読み込んで表示するための共通コンポーネント。
// ログイン画面・パスワードをお忘れの方画面の両方から使う。
//
// 環境変数 NEXT_PUBLIC_TURNSTILE_SITE_KEY が設定されていない間は、何も表示せず
// onToken も一度も呼ばれない（＝CAPTCHAが未設定でも、従来通りログイン等は動作する）。
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
    };
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export default function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const onTokenRef = useRef(onToken);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) return;
    const key = siteKey;

    function renderWidget() {
      if (!containerRef.current || !window.turnstile || renderedRef.current) return;
      renderedRef.current = true;
      window.turnstile.render(containerRef.current, {
        sitekey: key,
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
      });
    }

    if (window.turnstile) {
      renderWidget();
      return;
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", renderWidget);
    return () => script?.removeEventListener("load", renderWidget);
  }, [siteKey]);

  if (!siteKey) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
