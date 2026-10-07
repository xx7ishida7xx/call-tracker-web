import { normalizeJpPhone } from "@/lib/phone";

// シンプルな CSV パーサー（ダブルクォート囲み・カンマ/改行を含むフィールドに対応）
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // 先頭の BOM を除去
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r") {
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  // 最後の行
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface ParsedLeadRow {
  company: string;
  pref: string;
  address: string;
  phone: string;
  email: string;
  url: string;
  cms: string;
  genre: string;
  subgenre: string;
  hp_status: string; // HPの状態（空欄なら未設定）
  assignee: string; // 担当者名 または 担当するゲスト会社名（未入力なら空文字）
}

const HEADER_ALIASES: Record<string, keyof ParsedLeadRow> = {
  会社名: "company",
  屋号: "company",
  会社名屋号: "company",
  "会社名/屋号": "company",
  "会社名／屋号": "company",
  company: "company",
  都道府県: "pref",
  pref: "pref",
  住所: "address",
  address: "address",
  電話番号: "phone",
  電話: "phone",
  phone: "phone",
  tel: "phone",
  メールアドレス: "email",
  メール: "email",
  email: "email",
  url: "url",
  元cms: "cms",
  cms: "cms",
  業種: "genre",
  ジャンル: "genre",
  genre: "genre",
  業種詳細: "subgenre",
  サブジャンル: "subgenre",
  subgenre: "subgenre",
  HPの状態: "hp_status",
  hp状態: "hp_status",
  hpstatus: "hp_status",
  hp_status: "hp_status",
  担当者: "assignee",
  担当: "assignee",
  担当者会社: "assignee",
  assignee: "assignee",
  assignedto: "assignee",
  assigned_to: "assignee",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s　]/g, "");
}

export function parseLeadsCsv(text: string): { rows: ParsedLeadRow[]; unmatchedHeaders: string[] } {
  const table = parseCsvText(text);
  if (table.length === 0) return { rows: [], unmatchedHeaders: [] };

  const headerRow = table[0];
  const keyMap: (keyof ParsedLeadRow | null)[] = headerRow.map((h) => {
    const norm = normalizeHeader(h);
    return HEADER_ALIASES[norm] ?? HEADER_ALIASES[h.trim()] ?? null;
  });
  const unmatchedHeaders = headerRow.filter((h, i) => keyMap[i] === null && h.trim() !== "");

  const rows: ParsedLeadRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const rec: ParsedLeadRow = {
      company: "",
      pref: "",
      address: "",
      phone: "",
      email: "",
      url: "",
      cms: "",
      genre: "",
      subgenre: "",
      hp_status: "",
      assignee: "",
    };
    keyMap.forEach((key, i) => {
      if (key) rec[key] = (cells[i] ?? "").trim();
    });
    // 電話番号は、市外局番の区切り（ハイフンの位置）を正しい形にそろえる
    // （重複判定・既存リードとの突き合わせを、表記の違いに左右されないようにするため）
    rec.phone = normalizeJpPhone(rec.phone);
    if (rec.company || rec.phone || rec.email) rows.push(rec);
  }
  return { rows, unmatchedHeaders };
}

// ---------------------------------------------------------------------------
// CSV エクスポート用：1つのセルの値を、必要なときだけダブルクォートで囲む
// （カンマ・ダブルクォート・改行を含む場合のみ）。インポート側の
// parseCsvText と対になるエンコーダー。
// ---------------------------------------------------------------------------
export function csvField(value: string): string {
  if (/["\n\r,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsvText(headerRow: string[], rows: string[][]): string {
  const lines = [headerRow, ...rows].map((row) => row.map(csvField).join(","));
  // Excelで文字化けしないよう、先頭にBOMを付ける（parseCsvText側もBOMを除去する仕様）
  return "﻿" + lines.join("\r\n") + "\r\n";
}
