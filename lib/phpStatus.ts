// サイトのPHPバージョンを、外部から確認できる範囲（レスポンスヘッダー）で判定する。
//
//   ・URLにアクセスし、ヘッダー X-Powered-By / Server に出ている「PHP/8.1.20」の部分を読み取る。
//   ・ヘッダーを隠しているサイトは「非公開」（PHPかどうかも不明。PHPでないという意味ではない）。
//   ・診断は公開情報の取得のみ。ログインや書き込みは行わない。
//
// 判定の基準（2026-10-22 時点。PHP公式 https://www.php.net/supported-versions.php と、
// 2026-10-21 公開の重大な脆弱性 CVE-2026-109618 / CVE-2026-109619 の修正版にもとづく）は、
// 下の PHP_BRANCHES に集約している。サポート期限が来たら、ここを見直すこと。

export const PHP_STATUSES = ["サポート終了", "要更新", "最新", "推定古い", "非公開", "PHP以外", "取得失敗"] as const;
export type PhpStatus = (typeof PHP_STATUSES)[number];

// 一覧の絞り込みで選べる項目（「未判定」は、まだ判定していないリード）
export const PHP_FILTER_UNCHECKED = "未判定";
export const PHP_FILTER_OPTIONS = [...PHP_STATUSES, PHP_FILTER_UNCHECKED] as const;

// 色：サポート終了＝赤、要更新＝オレンジ、最新＝緑、それ以外（非公開など）＝グレー
export const PHP_STATUS_BADGE_CLS: Record<string, string> = {
  サポート終了: "bg-rose-100 text-rose-700",
  要更新: "bg-orange-100 text-orange-700",
  最新: "bg-emerald-100 text-emerald-700",
  推定古い: "bg-amber-100 text-amber-700",
  非公開: "bg-slate-100 text-slate-500",
  PHP以外: "bg-slate-100 text-slate-500",
  取得失敗: "bg-slate-100 text-slate-400",
};

// 各ブランチの「修正版」と「セキュリティサポートの終了日」
//   fixed … CVE-2026-109618 / CVE-2026-109619 の修正を含む最初の版（2026-10-21 公開）
//   eol   … セキュリティサポートの終了日
export const PHP_BRANCHES: Record<string, { fixed: number; eol: string }> = {
  "8.5": { fixed: 12, eol: "2029-12-31" },
  "8.4": { fixed: 27, eol: "2028-12-31" },
  "8.3": { fixed: 36, eol: "2027-12-31" },
  "8.2": { fixed: 35, eol: "2026-12-31" },
};

export type PhpResult = { version: string; status: PhpStatus; note: string };

// "8.1.20" / "7.4.33-1+ubuntu" / "8.2" → [8,1,20]
function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

// バージョン文字列から判定を決める（ネットワークを使わない部分。単体でテストできる）
export function classifyPhpVersion(version: string): PhpResult {
  const p = parseVersion(version);
  if (!p) return { version, status: "非公開", note: "バージョンを読み取れませんでした" };
  const [major, minor, patch] = p;
  const branch = `${major}.${minor}`;
  const hasPatch = /^\d+\.\d+\.\d+/.test(version);

  if (major < 8 || (major === 8 && minor < 2)) {
    return {
      version,
      status: "サポート終了",
      note: `PHP ${branch} は公式のサポートが終了しています。2026-10-21 公開の重大な脆弱性にも、公式の修正版が出ていません。`,
    };
  }
  const info = PHP_BRANCHES[branch];
  if (!info) {
    // 8.6 以降など、この表にまだない新しい版
    return { version, status: "最新", note: `PHP ${branch} は判定表にない新しい版です（修正版の確認が必要です）。` };
  }
  if (!hasPatch) {
    return { version, status: "要更新", note: `細かい版（${branch}.x の x）が読み取れないため、修正版（${branch}.${info.fixed}）かどうか確認が必要です。` };
  }
  if (patch < info.fixed) {
    return {
      version,
      status: "要更新",
      note:
        `PHP ${branch}.${info.fixed} 以降が、重大な脆弱性（2026-10-21 公開）の修正版です。` +
        `表示は ${version} です。レンタルサーバーによっては、表示を変えずに修正だけ当てている場合があるため、管理画面で確認してください。`,
    };
  }
  const eolNote = branch === "8.2" ? "ただし PHP 8.2 は 2026-12-31 でサポート終了予定です。" : "";
  return { version, status: "最新", note: `修正版（${branch}.${info.fixed}）以降です。${eolNote}`.trim() };
}

// ヘッダーの値（X-Powered-By / Server）から、PHPのバージョンを探す
export function extractPhpFromHeaders(poweredBy: string | null, server: string | null): { found: boolean; version: string; otherTech: string } {
  const joined = [poweredBy, server].filter(Boolean).join(" ; ");
  const withVersion = /PHP\/(\d+\.\d+(?:\.\d+)?[^\s;,)]*)/i.exec(joined);
  if (withVersion) return { found: true, version: withVersion[1], otherTech: "" };
  if (/\bPHP\b/i.test(joined)) return { found: true, version: "", otherTech: "" };
  return { found: false, version: "", otherTech: poweredBy ?? "" };
}

// ---------------------------------------------------------------------------
// WordPress の手がかりによる「推定」（ヘッダーにPHPの情報がないサイト用）
//   ページのHTMLから WordPress 本体のバージョンを読み取る。WordPress 6.0（2022年5月）より前は、
//   更新が止まっている可能性が高く、PHPも古い可能性があるため「推定古い」にする。
//   これは確定ではない（推定）。最終確認はサーバー管理画面で行う。
// ---------------------------------------------------------------------------
export function detectWordPress(html: string): { isWp: boolean; version: string } {
  const gen =
    /<meta[^>]+name=["']generator["'][^>]*content=["']WordPress\s+(\d+\.\d+(?:\.\d+)?)/i.exec(html) ??
    /<meta[^>]+content=["']WordPress\s+(\d+\.\d+(?:\.\d+)?)["'][^>]*name=["']generator["']/i.exec(html);
  if (gen) return { isWp: true, version: gen[1] };
  // 本体と同じバージョン番号が付く読み込みURLだけを使う（jquery など、部品ごとに番号が違うものは使わない）
  const core = /(?:block-library\/[^"'\s>]*|wp-emoji-release\.min\.js|wp-embed\.min\.js)\?ver=(\d+\.\d+(?:\.\d+)?)/i.exec(html);
  if (core) return { isWp: true, version: core[1] };
  return { isWp: /wp-content\/|wp-includes\//i.test(html), version: "" };
}

export function classifyWordPress(wp: { isWp: boolean; version: string }): PhpResult | null {
  if (!wp.isWp) return null;
  const p = parseVersion(wp.version);
  if (p && (p[0] < 6)) {
    return {
      version: "",
      status: "推定古い",
      note: `WordPress ${wp.version} を検出しました。WordPress 6.0（2022年5月）より前は更新が止まっている可能性が高く、PHPも古い可能性があります（推定。PHPのバージョンそのものは不明です）。`,
    };
  }
  return {
    version: "",
    status: "非公開",
    note: wp.version ? `WordPress ${wp.version} を検出しました（PHPのバージョンは不明です）。` : "WordPress を検出しました（PHPのバージョンは不明です）。",
  };
}
