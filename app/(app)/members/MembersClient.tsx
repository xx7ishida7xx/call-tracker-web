"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/actions";
import { canEditProfile, nameFor, ROLE_LABEL, ROLE_ORDER, type Profile, type Role } from "@/lib/types";
import { btnSecondarySmCls, cardCls, inputCls, sectionTitleCls } from "@/lib/ui";

export default function MembersClient({ me, roster }: { me: Profile; roster: Profile[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className={`text-lg ${sectionTitleCls}`}>メンバー管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          {me.is_owner
            ? "オーナーとして、全員の表示名・ロールを変更できます。"
            : "管理者として、自分自身と、管理者・オーナー以外のメンバーの表示名・ロールを変更できます。"}
        </p>
      </div>

      <div className={`overflow-x-auto ${cardCls}`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-orange-100 bg-orange-50/60 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-2.5">メールアドレス</th>
              <th className="px-4 py-2.5">登録名</th>
              <th className="px-4 py-2.5">表示名</th>
              <th className="px-4 py-2.5">ロール</th>
              <th className="px-4 py-2.5">所属チームリーダー</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {roster.map((m) => (
              <MemberRow key={m.id} me={me} member={m} roster={roster} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberRow({ me, member, roster }: { me: Profile; member: Profile; roster: Profile[] }) {
  const editable = canEditProfile(me, member);
  const canChangeRole = editable && (me.is_owner || (me.role === "admin" && me.id !== member.id));

  const [displayName, setDisplayName] = useState(member.display_name ?? "");
  const [role, setRole] = useState<Role>(member.role);
  const [teamLeadId, setTeamLeadId] = useState(member.team_lead_id ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamLeadOptions = roster.filter((r) => r.role === "teamlead" && r.id !== member.id);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateProfile(member.id, {
          display_name: displayName || null,
          ...(canChangeRole ? { role } : {}),
          ...(editable ? { team_lead_id: teamLeadId || null } : {}),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました。");
      }
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-orange-50/30">
      <td className="px-4 py-2.5 text-slate-600">
        {member.email}
        {member.is_owner && (
          <span className="ml-2 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            オーナー
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-slate-500">{member.name}</td>
      <td className="px-4 py-2.5">
        {editable ? (
          <input
            className={`w-36 ${inputCls}`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={member.name}
          />
        ) : (
          nameFor(member)
        )}
      </td>
      <td className="px-4 py-2.5">
        {canChangeRole ? (
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        ) : (
          ROLE_LABEL[member.role]
        )}
      </td>
      <td className="px-4 py-2.5">
        {editable ? (
          <select className={inputCls} value={teamLeadId} onChange={(e) => setTeamLeadId(e.target.value)}>
            <option value="">なし</option>
            {teamLeadOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {nameFor(t)}
              </option>
            ))}
          </select>
        ) : (
          roster.find((r) => r.id === member.team_lead_id)?.name ?? "なし"
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {editable && (
          <div className="flex items-center justify-end gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            {saved && <span className="text-xs font-medium text-emerald-600">保存しました</span>}
            <button onClick={save} disabled={isPending} className={btnSecondarySmCls}>
              保存
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
