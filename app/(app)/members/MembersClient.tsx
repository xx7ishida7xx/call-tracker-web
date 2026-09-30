"use client";

import { useState, useTransition } from "react";
import { deleteMember, inviteMember, sendMemberPasswordReset, updateProfile } from "@/app/actions";
import { canEditProfile, nameFor, ROLE_LABEL, ROLE_ORDER, type Profile, type Role } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { btnPrimaryCls, btnSecondarySmCls, cardCls, errorCls, inputCls, sectionTitleCls, successCls } from "@/lib/ui";

export default function MembersClient({
  me,
  roster,
  lastSignIns,
}: {
  me: Profile;
  roster: Profile[];
  lastSignIns: Record<string, string | null>;
}) {
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

      <InviteMemberForm canGrantAdmin={me.is_owner} />

      <div className={`overflow-x-auto ${cardCls}`}>
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-orange-100 bg-orange-50/60 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-2.5">メールアドレス</th>
              <th className="px-4 py-2.5">登録名</th>
              <th className="px-4 py-2.5">表示名</th>
              <th className="px-4 py-2.5">ロール</th>
              <th className="px-4 py-2.5">所属チームリーダー</th>
              <th className="px-4 py-2.5">最終ログイン</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {roster.map((m) => (
              <MemberRow key={m.id} me={me} member={m} roster={roster} lastSignIn={lastSignIns[m.id] ?? null} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberRow({
  me,
  member,
  roster,
  lastSignIn,
}: {
  me: Profile;
  member: Profile;
  roster: Profile[];
  lastSignIn: string | null;
}) {
  const editable = canEditProfile(me, member);
  const canChangeRole = editable && (me.is_owner || (me.role === "admin" && me.id !== member.id));
  // 削除・パスワード再設定は「オーナーを消せない／管理者を消せるのはオーナーだけ」
  // 「自分自身は対象外」という、ロール変更と同じ考え方の制限をかけている
  const canManageThisMember =
    !member.is_owner && me.id !== member.id && (me.is_owner || (me.role === "admin" && member.role !== "admin"));

  const [displayName, setDisplayName] = useState(member.display_name ?? "");
  const [role, setRole] = useState<Role>(member.role);
  const [teamLeadId, setTeamLeadId] = useState(member.team_lead_id ?? "");
  const [orgName, setOrgName] = useState(member.org_name ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resetSent, setResetSent] = useState(false);
  const [rowActionPending, startRowActionTransition] = useTransition();
  const [rowActionError, setRowActionError] = useState<string | null>(null);

  function sendReset() {
    setRowActionError(null);
    setResetSent(false);
    startRowActionTransition(async () => {
      try {
        await sendMemberPasswordReset(member.id);
        setResetSent(true);
      } catch (e) {
        setRowActionError(e instanceof Error ? e.message : "送信に失敗しました。");
      }
    });
  }

  function handleDeleteMember() {
    if (
      !window.confirm(
        `${nameFor(member)}（${member.email}）を削除しますか？\nこの操作は元に戻せません。担当していたリードは「未割当」になります。`
      )
    )
      return;
    setRowActionError(null);
    startRowActionTransition(async () => {
      try {
        await deleteMember(member.id);
      } catch (e) {
        setRowActionError(e instanceof Error ? e.message : "削除に失敗しました。");
      }
    });
  }

  const isGuestRole = role === "guest_admin" || role === "guest_member";

  // staff は teamlead の配下、guest_member は guest_admin の配下、というように
  // 「今選んでいるロールに応じたまとめ役」だけを選択肢に出す
  const leaderRoleFor: Partial<Record<Role, Role>> = { staff: "teamlead", guest_member: "guest_admin" };
  const leaderRole = leaderRoleFor[role];
  const teamLeadOptions = leaderRole ? roster.filter((r) => r.role === leaderRole && r.id !== member.id) : [];

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateProfile(member.id, {
          display_name: displayName || null,
          ...(canChangeRole ? { role, org_name: isGuestRole ? orgName || null : null } : {}),
          ...(editable ? { team_lead_id: leaderRole ? teamLeadId || null : null } : {}),
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
          <div className="flex flex-col gap-1">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            {isGuestRole && (
              <input
                className={`w-36 ${inputCls}`}
                placeholder="会社名（販売店が決まったら）"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            )}
          </div>
        ) : (
          <>
            {ROLE_LABEL[member.role]}
            {member.org_name && (member.role === "guest_admin" || member.role === "guest_member") && (
              <div className="text-xs text-slate-400">{member.org_name}</div>
            )}
          </>
        )}
      </td>
      <td className="px-4 py-2.5">
        {!leaderRole ? (
          <span className="text-slate-300">—</span>
        ) : editable ? (
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
      <td className="px-4 py-2.5 text-slate-500">
        {lastSignIn ? (
          formatDateTime(lastSignIn)
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            未ログイン
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex flex-col items-end gap-1.5">
          {editable && (
            <div className="flex items-center justify-end gap-2">
              {error && <span className="text-xs text-red-600">{error}</span>}
              {saved && <span className="text-xs font-medium text-emerald-600">保存しました</span>}
              <button onClick={save} disabled={isPending} className={btnSecondarySmCls}>
                保存
              </button>
            </div>
          )}
          {canManageThisMember && (
            <div className="flex items-center justify-end gap-2">
              {rowActionError && <span className="text-xs text-red-600">{rowActionError}</span>}
              {resetSent && <span className="text-xs font-medium text-emerald-600">送信しました</span>}
              <button onClick={sendReset} disabled={rowActionPending} className={btnSecondarySmCls}>
                パスワード再設定メールを送る
              </button>
              <button
                onClick={handleDeleteMember}
                disabled={rowActionPending}
                className={`${btnSecondarySmCls} border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700`}
              >
                削除
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// 新しいメンバーをメールで招待するフォーム。
// Supabaseから招待メールが届き、相手がリンクからパスワードを設定するとログインできるようになる。
function InviteMemberForm({ canGrantAdmin }: { canGrantAdmin: boolean }) {
  const inviteRoles = ROLE_ORDER.filter((r) => canGrantAdmin || r !== "admin");

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [isPending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    setSentTo(null);
    startTransition(async () => {
      try {
        const result = await inviteMember(email, role);
        setSentTo(result.email);
        setEmail("");
        setRole("staff");
      } catch (e) {
        setError(e instanceof Error ? e.message : "招待に失敗しました。");
      }
    });
  }

  return (
    <div className={`flex flex-col gap-3 ${cardCls} p-5`}>
      <div>
        <h2 className={sectionTitleCls}>新しいメンバーを招待</h2>
        <p className="mt-1 text-xs text-slate-500">
          メールアドレスを入力すると、Supabaseから招待メールが届きます。相手がリンクからパスワードを設定すると、そのままログインできるようになります。
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          メールアドレス
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="例：yamada@example.com"
            className={`w-64 ${inputCls}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          最初のロール
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputCls}>
            {inviteRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <button onClick={submit} disabled={isPending || !email} className={btnPrimaryCls}>
          {isPending ? "送信中…" : "招待メールを送る"}
        </button>
      </div>
      {error && <p className={errorCls}>{error}</p>}
      {sentTo && <p className={successCls}>{sentTo} 宛に招待メールを送信しました。</p>}
    </div>
  );
}
