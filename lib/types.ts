export type Role = "admin" | "teamlead" | "staff" | "guest";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "管理者",
  teamlead: "チームリーダー",
  staff: "スタッフ",
  guest: "ゲスト",
};

export const ROLE_ORDER: Role[] = ["admin", "teamlead", "staff", "guest"];

export interface Profile {
  id: string;
  email: string;
  name: string;
  display_name: string | null;
  role: Role;
  is_owner: boolean;
  team_lead_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  company: string;
  pref: string;
  address: string;
  phone: string;
  email: string;
  url: string;
  cms: string;
  genre: string;
  subgenre: string;
  status: string;
  assigned_to: string | null;
  last_call_at: string | null;
  last_call_staff: string | null;
  recall_at: string | null;
  recall_target: string | null;
  rep_name: string | null;
  rep_mobile: string | null;
  contact_name: string | null;
  contact_mobile: string | null;
  contracts: unknown[];
  custom: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  lead_id: string;
  caller_id: string | null;
  called_at: string;
  result: string;
  recall_at: string | null;
  recall_target: string | null;
  appointment: boolean;
  notes: string;
  created_at: string;
}

export const LEAD_STATUSES = [
  "未着手",
  "架電中",
  "アポ獲得",
  "成約",
  "見送り",
  "対象外",
] as const;

export function nameFor(p: Pick<Profile, "display_name" | "name" | "email"> | null | undefined): string {
  if (!p) return "（不明なメンバー）";
  return p.display_name || p.name || p.email || "（名称未設定）";
}

export function canManageMembers(me: Profile | null): boolean {
  if (!me) return false;
  return me.is_owner || me.role === "admin";
}

// 指定した相手の表示名/ロールを自分が編集できるか
export function canEditProfile(me: Profile | null, target: Profile): boolean {
  if (!me) return false;
  if (me.id === target.id) return true;
  if (me.is_owner) return true;
  if (me.role === "admin" && !target.is_owner && target.role !== "admin") return true;
  return false;
}
