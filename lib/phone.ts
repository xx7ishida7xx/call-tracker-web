import { parsePhoneNumberFromString } from "libphonenumber-js/min";

// 日本の電話番号を、市外局番の区切りが正しい形（例：03-6882-5200、042-946-8654、
// 0120-046-666、090-1234-5678）にそろえる。
//
// 背景：リストによっては、東京の「03-6882-5200」が「036-882-5200」のように、
// 数字は同じなのにハイフンの位置だけがずれていることがある（市外局番の桁数は
// 地域ごとに2〜5桁と違うため）。数字の並びさえ合っていれば、正しいハイフンの位置は
// 国際的な市外局番の表（libphonenumber）から機械的に決まる。
// CSVインポートでは、この関数で表記をそろえてから「すでに登録済みか」の判定と
// 登録を行うことで、ハイフンの違いによる二重登録を防ぐ。
//
// 国外の番号（+で始まる）や、番号として成立しないもの（桁数が合わないなど）は、
// 元の文字列のまま返す（勝手に書き換えない）。
export function normalizeJpPhone(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value || value.startsWith("+")) return value;
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  const national = digits.startsWith("0") ? digits : "0" + digits;
  const parsed = parsePhoneNumberFromString(national, "JP");
  if (!parsed || !parsed.isValid()) return value;
  return parsed.formatNational();
}
