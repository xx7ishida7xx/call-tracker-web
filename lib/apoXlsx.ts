// アポ表をExcel（.xlsx）として書き出す。外部ライブラリは使わず、xlsx（=XMLをZIPにまとめたもの）を
// このファイルだけで組み立てている。見た目は、これまで使っていたExcelのアポ表（列幅・行の高さ・
// 結合セル・色・罫線）にそろえている。
//
// 構造：
//   buildApoXlsx(data)  → Excelファイルの中身（Buffer）
//   ├ buildBlocks()     … シートの各ブロック（結合セル単位）の位置・文字・見た目の定義
//   ├ styles.xml 生成    … ブロックの見た目から、必要な書式だけを重複なく登録
//   └ zip 組み立て       … ZIP形式（deflate圧縮）で1つのファイルにまとめる

import { deflateRawSync } from "node:zlib";
import type { ApoData } from "@/lib/apoSheet";

// ---------------------------------------------------------------------------
// ブロック（結合セル単位）の定義
// ---------------------------------------------------------------------------
type Kind = "title" | "labelBlue" | "labelGrey" | "labelYellow" | "bandYellow" | "bandGreen" | "value" | "valueLeft" | "bigText" | "memoText";

type Block = {
  r1: number;
  c1: number; // 列番号（A=1, B=2 ...）
  r2: number;
  c2: number;
  kind: Kind;
  text?: string;
  num?: number; // 日付・時刻（Excelのシリアル値）
  numFmt?: string; // 例："yyyy/m/d" / "h:mm"
};

const B = 2,
  C = 3,
  D = 4,
  E = 5,
  F = 6,
  G = 7,
  H = 8,
  I = 9;

// "2026-10-16" → Excelの日付シリアル値（1899-12-30 からの日数）
function dateSerial(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round(ms / 86400000) + 25569;
}
// "12:00" → 1日を1とした小数（Excelの時刻）
function timeSerial(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return (Number(m[1]) * 60 + Number(m[2])) / 1440;
}

function buildBlocks(d: ApoData): Block[] {
  const blocks: Block[] = [];
  const add = (r1: number, c1: number, r2: number, c2: number, kind: Kind, text = "") => blocks.push({ r1, c1, r2, c2, kind, text });
  const addDate = (r: number, c: number, s: string, dash: boolean) => {
    const n = dateSerial(s);
    if (n !== null) blocks.push({ r1: r, c1: c, r2: r, c2: c, kind: "value", num: n, numFmt: "yyyy/m/d" });
    else add(r, c, r, c, "value", dash ? "-" : "");
  };
  const addTime = (r: number, c: number, s: string, dash: boolean) => {
    const n = timeSerial(s);
    if (n !== null) blocks.push({ r1: r, c1: c, r2: r, c2: c, kind: "value", num: n, numFmt: "h:mm" });
    else add(r, c, r, c, "value", dash ? "-" : "");
  };

  add(2, E, 2, F, "title", "アポ表");

  // 4行目：営業担当／アポ取得日
  add(4, B, 4, B, "labelBlue", "営業担当");
  add(4, C, 4, C, "value", d.sales_rep);
  add(4, D, 4, D, "labelBlue", "アポ取得日");
  addDate(4, E, d.apo_date, false);

  // 5行目：前確日・前確時間・訪問日・訪問時間
  add(5, B, 5, B, "labelGrey", "前確日");
  addDate(5, C, d.pre_date, true);
  add(5, D, 5, D, "labelGrey", "前確時間");
  addTime(5, E, d.pre_time, true);
  add(5, F, 5, F, "labelGrey", "訪問日");
  addDate(5, G, d.visit_date, false);
  add(5, H, 5, H, "labelGrey", "訪問時間");
  addTime(5, I, d.visit_time, false);

  add(6, B, 6, B, "labelGrey", "会社名(屋号名)");
  add(6, C, 6, E, "value", d.company);
  add(6, F, 6, F, "labelGrey", "業種");
  add(6, G, 6, I, "value", d.genre);

  add(7, B, 7, B, "labelGrey", "電話番号");
  add(7, C, 7, E, "value", d.phone);
  add(7, F, 7, F, "labelGrey", "携帯");
  add(7, G, 7, I, "value", d.mobile);

  add(8, B, 8, B, "labelGrey", "住所");
  add(8, C, 8, I, "value", d.address);

  add(9, B, 9, B, "labelGrey", "代表者名");
  add(9, C, 9, C, "value", d.rep_name);
  add(9, D, 9, D, "labelGrey", "性別");
  add(9, E, 9, E, "value", d.gender);
  add(9, F, 9, F, "labelGrey", "年齢");
  add(9, G, 9, G, "value", d.age);
  add(9, H, 9, H, "labelGrey", "商談時間");
  add(9, I, 9, I, "value", d.meeting_time);

  add(10, B, 10, B, "labelGrey", "決裁者名");
  add(10, C, 10, D, "value", d.approver);
  add(10, E, 10, E, "labelGrey", "同席");
  add(10, F, 10, G, "value", d.attendee);
  add(10, H, 10, H, "labelGrey", "費用認識");
  add(10, I, 10, I, "value", d.cost_aware);

  add(11, B, 11, B, "labelBlue", "アポインター");
  add(11, C, 11, C, "value", d.appointer);
  add(11, D, 11, D, "labelBlue", "商談者");
  add(11, E, 11, E, "value", d.negotiator);
  add(11, F, 11, F, "labelBlue", "同行者");
  add(11, G, 11, G, "value", d.companion);
  add(11, H, 11, H, "labelBlue", "提案種別");
  add(11, I, 11, I, "value", d.proposal);

  add(12, B, 12, I, "bandYellow", "確認事項");
  const checks: [string, string][] = [
    ["HP", d.hp],
    ["HP業者", d.hp_vendor],
    ["残債", d.remaining_debt],
    ["広告費用", d.ad_cost],
    ["広告目的", d.ad_purpose],
    ["決裁フロー", d.approval_flow],
    ["患者対応状況", d.patient_handling],
    ["業者付き合い", d.vendor_relations],
    ["継続期間", d.duration],
  ];
  checks.forEach(([label, val], i) => {
    const r = 13 + i;
    add(r, B, r, B, "labelYellow", label);
    add(r, C, r, I, "valueLeft", val);
  });

  add(22, B, 22, I, "bandYellow", "興味を引いたポイント、アポになった経緯");
  add(23, B, 33, I, "bigText", d.story);
  add(34, B, 34, I, "bandGreen", "備考");
  add(35, B, 45, I, "memoText", d.memo);
  return blocks;
}

// 列幅・行の高さ（元のExcelのアポ表と同じ）
// A4縦1枚にちょうど収まるよう、元のExcelの列幅を約7%広げ、行の高さの既定値を元と同じ15にしている
// （紙の縦横比に合わせると、縮小率が下がって文字が大きく印刷される）。
const COL_WIDTHS: Record<number, number> = { 1: 2.5, 2: 17.1, 3: 22.7, 4: 10.5, 5: 17, 6: 12.3, 7: 22.7, 8: 9.5, 9: 18 };
const ROW_HEIGHTS: Record<number, number> = {
  2: 35.25, 3: 36, 4: 23.45, 5: 31.5, 6: 31.5, 7: 27.75, 8: 31.5, 9: 34.5, 10: 30.75, 11: 31.5, 12: 33.75,
  13: 45, 14: 35.25, 15: 33, 16: 30, 17: 29.25, 18: 33, 19: 26.25, 20: 26.25, 21: 31.5, 22: 24, 34: 28.15,
};
// 「経緯」と「備考」の大きな入力枠（23〜33行／35〜45行）は、A4縦1枚の高さをちょうど使い切るよう、1行ずつ少し高くしている
for (let r = 23; r <= 33; r++) ROW_HEIGHTS[r] = 27;
for (let r = 35; r <= 45; r++) ROW_HEIGHTS[r] = 27;
const DEFAULT_ROW_HEIGHT = 15;

// ---------------------------------------------------------------------------
// 見た目（フォント・塗り・罫線）→ styles.xml の組み立て
// ---------------------------------------------------------------------------
type Edge = "thin" | "medium" | null;
type StyleKey = {
  font: "title" | "bold" | "bigBold" | "normal" | "white";
  fill: string | null; // RGB（例："FFF4F781"）
  h: "center" | "left";
  v: "center" | "top";
  wrap: boolean;
  numFmt: string | null;
  l: Edge;
  r: Edge;
  t: Edge;
  b: Edge;
};

const FONT_FAMILY = "メイリオ";
const FILL = { blue: "FF5B9BD5", grey: "FFD9D9D9", yellow: "FFF4F781", green: "FFB4FAD4" };

function baseStyle(kind: Kind): Omit<StyleKey, "l" | "r" | "t" | "b" | "numFmt"> {
  switch (kind) {
    case "title":
      return { font: "title", fill: null, h: "center", v: "center", wrap: false };
    case "labelBlue":
      return { font: "white", fill: FILL.blue, h: "center", v: "center", wrap: true };
    case "labelGrey":
      return { font: "bold", fill: FILL.grey, h: "center", v: "center", wrap: true };
    case "labelYellow":
      return { font: "bold", fill: FILL.yellow, h: "center", v: "center", wrap: true };
    case "bandYellow":
      return { font: "bold", fill: FILL.yellow, h: "center", v: "center", wrap: true };
    case "bandGreen":
      return { font: "bold", fill: FILL.green, h: "center", v: "center", wrap: true };
    case "value":
      return { font: "bold", fill: null, h: "center", v: "center", wrap: true };
    case "valueLeft":
      return { font: "normal", fill: null, h: "left", v: "center", wrap: true };
    case "bigText":
      return { font: "bigBold", fill: null, h: "left", v: "top", wrap: true };
    case "memoText":
      return { font: "normal", fill: null, h: "left", v: "top", wrap: true };
  }
}

const FONT_DEFS: Record<StyleKey["font"], string> = {
  title: `<font><b/><sz val="22"/><name val="${FONT_FAMILY}"/><family val="3"/></font>`,
  bold: `<font><b/><sz val="11"/><name val="${FONT_FAMILY}"/><family val="3"/></font>`,
  bigBold: `<font><b/><sz val="10"/><name val="${FONT_FAMILY}"/><family val="3"/></font>`,
  normal: `<font><sz val="11"/><name val="${FONT_FAMILY}"/><family val="3"/></font>`,
  white: `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="${FONT_FAMILY}"/><family val="3"/></font>`,
};
const FONT_ORDER: StyleKey["font"][] = ["title", "bold", "bigBold", "normal", "white"];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// XMLで使えない制御文字を除く（改行・タブは残す）
function cleanText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\r\n?/g, "\n");
}

function colLetter(c: number): string {
  return String.fromCharCode(64 + c);
}

class StyleBook {
  private keys: StyleKey[] = [];
  private index = new Map<string, number>();
  private fills: string[] = [];
  private numFmts: string[] = [];

  idFor(k: StyleKey): number {
    const sig = JSON.stringify(k);
    const hit = this.index.get(sig);
    if (hit !== undefined) return hit;
    if (k.fill && !this.fills.includes(k.fill)) this.fills.push(k.fill);
    if (k.numFmt && !this.numFmts.includes(k.numFmt)) this.numFmts.push(k.numFmt);
    this.keys.push(k);
    // 0番は何も指定のない既定の書式なので、1番から使う
    const id = this.keys.length;
    this.index.set(sig, id);
    return id;
  }

  xml(): string {
    const border = (e: Edge, tag: string) => (e ? `<${tag} style="${e}"><color auto="1"/></${tag}>` : `<${tag}/>`);
    const borders: string[] = [`<border><left/><right/><top/><bottom/><diagonal/></border>`];
    const borderIndex = new Map<string, number>();
    const xfs: string[] = [`<xf numFmtId="0" fontId="${FONT_ORDER.indexOf("normal")}" fillId="0" borderId="0" xfId="0"/>`];
    for (const k of this.keys) {
      const bsig = `${k.l}|${k.r}|${k.t}|${k.b}`;
      let bi = borderIndex.get(bsig);
      if (bi === undefined) {
        borders.push(`<border>${border(k.l, "left")}${border(k.r, "right")}${border(k.t, "top")}${border(k.b, "bottom")}<diagonal/></border>`);
        bi = borders.length - 1;
        borderIndex.set(bsig, bi);
      }
      const fillId = k.fill ? 2 + this.fills.indexOf(k.fill) : 0;
      const numFmtId = k.numFmt ? 164 + this.numFmts.indexOf(k.numFmt) : 0;
      xfs.push(
        `<xf numFmtId="${numFmtId}" fontId="${FONT_ORDER.indexOf(k.font)}" fillId="${fillId}" borderId="${bi}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${k.numFmt ? ' applyNumberFormat="1"' : ""}>` +
          `<alignment horizontal="${k.h}" vertical="${k.v}"${k.wrap ? ' wrapText="1"' : ""}/></xf>`
      );
    }
    const numFmtsXml = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join("")}</numFmts>`
      : "";
    const fillsXml =
      `<fills count="${2 + this.fills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      this.fills.map((rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`).join("") +
      `</fills>`;
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      numFmtsXml +
      `<fonts count="${FONT_ORDER.length}">${FONT_ORDER.map((f) => FONT_DEFS[f]).join("")}</fonts>` +
      fillsXml +
      `<borders count="${borders.length}">${borders.join("")}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="${FONT_ORDER.indexOf("normal")}" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`
    );
  }
}

// ---------------------------------------------------------------------------
// シート本体（sheet1.xml）
// ---------------------------------------------------------------------------
const TOP = 4; // 罫線で囲む表の範囲（4行目〜45行目、B列〜I列）
const BOTTOM = 45;

function buildSheetXml(blocks: Block[], styles: StyleBook): string {
  // セルごとに「文字・数値・書式番号」を決める。結合セルの2つ目以降も、罫線を出すため空のセルを置く。
  const cells = new Map<string, { r: number; c: number; style: number; text?: string; num?: number }>();
  const merges: string[] = [];

  for (const b of blocks) {
    const base = baseStyle(b.kind);
    const framed = b.kind !== "title";
    for (let r = b.r1; r <= b.r2; r++) {
      for (let c = b.c1; c <= b.c2; c++) {
        // 外枠は太線、内側は細線。バンド（見出し行）は上下を太線にする。
        const isBand = b.kind === "bandYellow" || b.kind === "bandGreen";
        const edge = (outer: boolean, atOuterFrame: boolean): Edge => (!framed ? null : outer && (atOuterFrame || isBand) ? "medium" : "thin");
        const key: StyleKey = {
          ...base,
          numFmt: b.numFmt ?? null,
          l: !framed ? null : c === b.c1 ? edge(true, c === B) : null,
          r: !framed ? null : c === b.c2 ? edge(true, c === I || (r === 4 && c === E)) : null,
          t: !framed ? null : r === b.r1 ? edge(true, r === TOP) : null,
          b: !framed ? null : r === b.r2 ? edge(true, r === BOTTOM) : null,
        };
        // 隣のブロックと接する辺は、片側（右・下）の細線だけだと線が欠けるので、全辺に細線を入れる
        if (framed) {
          key.l = key.l ?? "thin";
          key.r = key.r ?? "thin";
          key.t = key.t ?? "thin";
          key.b = key.b ?? "thin";
        }
        const first = r === b.r1 && c === b.c1;
        cells.set(`${r},${c}`, {
          r,
          c,
          style: styles.idFor(key),
          text: first && b.text ? cleanText(b.text) : undefined,
          num: first ? b.num : undefined,
        });
      }
    }
    if (b.r1 !== b.r2 || b.c1 !== b.c2) merges.push(`${colLetter(b.c1)}${b.r1}:${colLetter(b.c2)}${b.r2}`);
  }

  const rows = new Map<number, typeof cells extends Map<string, infer V> ? V[] : never>();
  for (const cell of cells.values()) {
    if (!rows.has(cell.r)) rows.set(cell.r, []);
    rows.get(cell.r)!.push(cell);
  }
  const rowNums = Array.from(rows.keys()).sort((a, b) => a - b);

  const sheetRows = rowNums
    .map((r) => {
      const h = ROW_HEIGHTS[r] ?? DEFAULT_ROW_HEIGHT;
      const cs = rows
        .get(r)!
        .sort((a, b) => a.c - b.c)
        .map((cell) => {
          const ref = `${colLetter(cell.c)}${r}`;
          if (cell.num !== undefined) return `<c r="${ref}" s="${cell.style}"><v>${cell.num}</v></c>`;
          if (cell.text) return `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.text)}</t></is></c>`;
          return `<c r="${ref}" s="${cell.style}"/>`;
        })
        .join("");
      return `<row r="${r}" ht="${h}" customHeight="1">${cs}</row>`;
    })
    .join("");

  const cols = Object.entries(COL_WIDTHS)
    .map(([c, w]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`)
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="B2:I45"/>` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="${DEFAULT_ROW_HEIGHT}" customHeight="1"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${sheetRows}</sheetData>` +
    `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` +
    `<printOptions horizontalCentered="1"/>` +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/>` +
    `</worksheet>`
  );
}

// ---------------------------------------------------------------------------
// ZIP（xlsx本体）の組み立て
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const comp = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 必要なバージョン
    local.writeUInt16LE(0x0800, 6); // ファイル名はUTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // 日付（1980-01-01）
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const XML_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function buildApoXlsx(data: ApoData): Buffer {
  const styles = new StyleBook();
  const sheet = buildSheetXml(buildBlocks(data), styles);
  const files = [
    {
      name: "[Content_Types].xml",
      data:
        XML_HEAD +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      data:
        XML_HEAD +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data:
        XML_HEAD +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="アポ表" sheetId="1" r:id="rId1"/></sheets>` +
        // 印刷範囲：A列（余白用の細い列）を除いた B2:I45 を、A4縦1枚に印刷する
        `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'アポ表'!$B$2:$I$45</definedName></definedNames></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        XML_HEAD +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { name: "xl/styles.xml", data: styles.xml() },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ].map((f) => ({ name: f.name, data: Buffer.from(f.data, "utf8") }));
  return zip(files);
}
