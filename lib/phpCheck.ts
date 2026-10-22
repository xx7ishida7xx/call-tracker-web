import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { classifyPhpVersion, extractPhpFromHeaders, type PhpResult } from "@/lib/phpStatus";

// サイトにアクセスしてPHPバージョンを判定する部分（サーバー側専用。判定の基準は lib/phpStatus.ts）

// ---------------------------------------------------------------------------
// ネットワーク部分
// ---------------------------------------------------------------------------
const REQUEST_TIMEOUT_MS = 7000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; SamuraiON-SiteCheck/1.0; +https://call-tracker-web.vercel.app)";

function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    );
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateIp(mapped[1]);
    return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb");
  }
  return true;
}

// 社内ネットワークなどに向いたURLへはアクセスしない（リードのURL欄に変なものが入っていても安全にする）
async function assertPublicUrl(u: URL): Promise<void> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("http/https 以外のURLです");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new Error("社内向けのURLです");
  }
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) throw new Error("通常と違うポートのURLです");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("社内向けのIPアドレスです");
    return;
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("社内向けのアドレスに解決されました");
}

// 転送（リダイレクト）を自分でたどりながら、最後に出てきた PHP の情報を返す
async function fetchHeaders(startUrl: string): Promise<{ poweredBy: string | null; server: string | null }> {
  let current = new URL(startUrl);
  let poweredBy: string | null = null;
  let server: string | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.5" },
    });
    // 中身（ページ本体）は読まない。ヘッダーだけ見て接続を閉じる。
    try {
      await res.body?.cancel();
    } catch {
      /* 無視 */
    }
    poweredBy = res.headers.get("x-powered-by") ?? poweredBy;
    server = res.headers.get("server") ?? server;
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current);
      continue;
    }
    return { poweredBy, server };
  }
  return { poweredBy, server };
}

// "example.com" のようにスキームがないURLにも対応する
function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

// 1つのサイトのPHPバージョンを判定する（失敗しても例外は投げず、「取得失敗」を返す）
export async function checkSitePhp(rawUrl: string): Promise<PhpResult> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { version: "", status: "取得失敗", note: "URLを読み取れませんでした" };

  const first = new URL(url);
  const alt = new URL(url);
  alt.protocol = first.protocol === "https:" ? "http:" : "https:";

  let lastError = "";
  for (const target of [first, alt]) {
    try {
      const { poweredBy, server } = await fetchHeaders(target.toString());
      const found = extractPhpFromHeaders(poweredBy, server);
      if (found.found && found.version) return classifyPhpVersion(found.version);
      if (found.found) return { version: "", status: "非公開", note: "PHPで動いていますが、バージョンは公開されていません" };
      if (found.otherTech) return { version: "", status: "PHP以外", note: `X-Powered-By: ${found.otherTech.slice(0, 80)}` };
      return { version: "", status: "非公開", note: "ヘッダーにPHPの情報がありません（PHPでないという意味ではありません）" };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // 社内向けURLなど、安全のために止めたものは、別のスキームでも試さない
      if (/社内向け|http\/https 以外|通常と違うポート/.test(lastError)) break;
    }
  }
  const short = /timeout|aborted/i.test(lastError) ? "応答がありませんでした（時間切れ）" : lastError.slice(0, 100) || "接続できませんでした";
  return { version: "", status: "取得失敗", note: short };
}
