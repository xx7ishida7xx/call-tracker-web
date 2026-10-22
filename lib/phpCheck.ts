import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { classifyPhpVersion, classifyWordPress, detectWordPress, extractPhpFromHeaders, type PhpResult } from "@/lib/phpStatus";

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
const MAX_BODY_BYTES = 200_000;

// 最終ページの本文を、先頭 MAX_BODY_BYTES だけ読む（PHPの情報がなかったときの手がかり探し用）
async function readBodyHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
  } catch {
    /* 途中までで十分 */
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* 無視 */
    }
  }
  const merged = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    merged.set(c, o);
    o += c.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

async function fetchHeaders(
  startUrl: string,
  wantBody: (poweredBy: string | null, server: string | null) => boolean
): Promise<{ poweredBy: string | null; server: string | null; body: string }> {
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
    poweredBy = res.headers.get("x-powered-by") ?? poweredBy;
    server = res.headers.get("server") ?? server;
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      try {
        await res.body?.cancel();
      } catch {
        /* 無視 */
      }
      current = new URL(loc, current);
      continue;
    }
    // PHPの情報がヘッダーになければ、ページの先頭だけ読んで手がかりを探す。あれば本文は読まない。
    if (wantBody(poweredBy, server)) return { poweredBy, server, body: await readBodyHead(res) };
    try {
      await res.body?.cancel();
    } catch {
      /* 無視 */
    }
    return { poweredBy, server, body: "" };
  }
  return { poweredBy, server, body: "" };
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
      const { poweredBy, server, body } = await fetchHeaders(target.toString(), (pb, sv) => !extractPhpFromHeaders(pb, sv).found);
      const found = extractPhpFromHeaders(poweredBy, server);
      if (found.found && found.version) return classifyPhpVersion(found.version);
      if (found.found) return { version: "", status: "非公開", note: "PHPで動いていますが、バージョンは公開されていません" };
      // WordPress は PHP で動くので、PHP以外と判断する前に先に確認する
      const wp = classifyWordPress(detectWordPress(body));
      if (wp) return wp;
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
