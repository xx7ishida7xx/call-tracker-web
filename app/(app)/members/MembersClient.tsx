"use client";

import { useState, useTransition } from "react";
import {
  createCompany,
  deleteCompany,
  deleteMember,
  inviteMember,
  renameCompany,
  sendMemberPasswordReset,
  updateProfile,
} from "@/app/actions";
import { canEditProfile, nameFor, ROLE_LABEL, ROLE_ORDER, type Profile, type Role } from "@/lib/types";
import { companyLabel, type Company } from "@/lib/companies";
import { formatDateTime } from "@/lib/format";
import { btnPrimaryCls, btnSecondarySmCls, cardCls, errorCls, inputCls, sectionTitleCls, successCls } from "@/lib/ui";

// ゲストアカウントの簡易レート制限（migration 0018）で、実際にアクセス集中として
// ブロックされた記録のまとめ（誰が・どのページで・何回・最後にいつ）
export type RateLimitAlert = {
  profileId: string;
  name: string;
  route: string;
  count: number;
  lastAt: string;
};

export default function MembersClient({
  me,
  roster,
  lastSignIns,
  companies,
  rateLimitAlerts,
}: {
  me: Profile;
  roster: Profile[];
  lastSignIns: Record<string, string | null>;
  companies: Company[];
  rateLimitAlerts: RateLimitAlert[];
}) {
  const [companyList, setCompanyList] = useState<Company[]>(companies);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className={`text-lg ${sectionTitleCls}`}>メンバー管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          {me.is_owner
            ? "オーナーとして、全員の表示名・ロール・所属会社を変更できます。"
            : "管理者として、自分自身と、管理者・オーナー以外のメンバーの表示名・ロール・所属会社を変更できます。"}
        </p>
      </div>

      {rateLimitAlerts.length > 0 && (
        <div className={`${cardCls} border-red-200 bg-red-50/60 p-4`}>
          <h2 className="text-sm font-bold text-red-700">
            ⚠ アクセス集中の検知（直近14日間）
          </h2>
          <p className="mt-1 text-xs text-red-600">
            ゲストアカウントが、短時間に通常の利用では考えにくい回数アクセスしたため、一時的に表示を制限した記録です。
            自動ツールなどでの大量アクセスの可能性があります。心当たりがない場合は、該当アカウントにご確認ください。
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-red-100 text-left text-xs font-semibold text-red-700">
                  <th className="py-1.5 pr-4">アカウント</th>
                  <th className="py-1.5 pr-4">ページ</th>
                  <th className="py-1.5 pr-4">検知回数</th>
                  <th className="py-1.5 pr-4">最終検知日時</th>
                </tr>
              </thead>
              <tbody>
                {rateLimitAlerts.map((a) => (
                  <tr key={`${a.profileId}:${a.route}`} className="border-b border-red-100/60 text-slate-700 last:border-0">
                    <td className="py-1.5 pr-4">{a.name}</td>
                    <td className="py-1.5 pr-4">{a.route}</td>
                    <td className="py-1.5 pr-4">{a.count} 回</td>
                    <td className="py-1.5 pr-4">{formatDateTime(a.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CompaniesManager companies={companyList} onChange={setCompanyList} />

      <InviteMemberForm canGrantAdmin={me.is_owner} companies={companyList} />

      <div className={`overflow-x-auto ${cardCls}`}>
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="border-b border-orange-100 bg-orange-50/60 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-2.5">メールアドレス</th>
              <th className="px-4 py-2.5">登録名</th>
              <th className="px-4 py-2.5">表示名</th>
              <th className="px-4 py-2.5">ロール</th>
              <th className="px-4 py-2.5">所属会社</th>
              <th className="px-4 py-2.5">所属チームリーダー</th>
              <th className="px-4 py-2.5">最終ログイン</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {roster.map((m) => (
              <MemberRow
                key={m.id}
                me={me}
                member={m}
                roster={roster}
                lastSignIn={lastSignIns[m.id] ?? null}
                companies={companyList}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 会社（ミライアゴーゴー自身・各ゲスト会社）の一覧管理。
// ここで登録しておいた会社が、招待画面・メンバー編集の「所属会社」の選択肢になる。
function CompaniesManager({
  companies,
  onChange,
}: {
  companies: Company[];
  onChange: (next: Company[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newCanViewAllLeads, setNewCanViewAllLeads] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function addCompany() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      try {
        const created = await createCompany(name, newDisplayName, newCanViewAllLeads);
        onChange([
          ...companies,
          {
            id: created.id,
            name: created.name,
            display_name: created.display_name,
            is_home: false,
            can_view_all_leads: created.can_view_all_leads,
          },
        ]);
        setNewName("");
        setNewDisplayName("");
        setNewCanViewAllLeads(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "登録に失敗しました。");
      }
    });
  }

  return (
    <div className={`flex flex-col gap-3 ${cardCls} p-5`}>
      <div>
        <h2 className={sectionTitleCls}>会社の管理</h2>
        <p className="mt-1 text-xs text-slate-500">
          ミライアゴーゴー自身や、各ゲスト会社（販売店など）をここで登録しておくと、下の「新しいメンバーを招待」やメンバーごとの「所属会社」、CSVインポートの担当者振り分けで選べるようになります。ゲスト会社が実際に稼働する前に、先に登録しておくことができます。
        </p>
        <p className="mt-1 text-xs text-slate-500">
          「表示名称」は、正式名称が長い場合などに使う略称です（例：正式名称「株式会社ミライアゴーゴー」→表示名称「MAG」）。未入力でも構いません。CSVインポートの「担当者」欄に表示名称が入っている場合も、正式名称と同じように自動で担当会社を認識します。
        </p>
        <p className="mt-1 text-xs text-slate-500">
          ゲスト会社（guest_admin / guest_member）は、既定では「自社の誰かに割り当てられたリード」だけを閲覧・架電できます（会社に所属する全員で共有、個人単位の割り当てではありません）。「全リード閲覧」をオンにすると、他社に割り振った分も含めて全リードを検索・閲覧できるようになります。いつでも後から切り替え可能です。
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {companies.map((c) => (
          <CompanyRow key={c.id} company={c} companies={companies} onChange={onChange} />
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          新しい会社名・正式名称（ゲスト会社の販売店名など）
          <input
            className={`w-64 ${inputCls}`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例：株式会社〇〇商事"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          表示名称（任意・略称）
          <input
            className={`w-40 ${inputCls}`}
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            placeholder="例：〇〇商事"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={newCanViewAllLeads}
            onChange={(e) => setNewCanViewAllLeads(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          全リード閲覧
        </label>
        <button onClick={addCompany} disabled={isPending || !newName.trim()} className={btnPrimaryCls}>
          会社を追加
        </button>
      </div>
      {error && <p className={errorCls}>{error}</p>}
    </div>
  );
}

function CompanyRow({
  company,
  companies,
  onChange,
}: {
  company: Company;
  companies: Company[];
  onChange: (next: Company[]) => void;
}) {
  const [name, setName] = useState(company.name);
  const [displayName, setDisplayName] = useState(company.display_name ?? "");
  const [canViewAllLeads, setCanViewAllLeads] = useState(company.can_view_all_leads);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    name.trim() !== company.name ||
    displayName.trim() !== (company.display_name ?? "") ||
    canViewAllLeads !== company.can_view_all_leads;

  function save() {
    const cleanName = name.trim();
    if (!cleanName || !isDirty) return;
    setError(null);
    startTransition(async () => {
      try {
        await renameCompany(company.id, cleanName, displayName, canViewAllLeads);
        const cleanDisplayName = displayName.trim() || null;
        onChange(
          companies.map((c) =>
            c.id === company.id
              ? { ...c, name: cleanName, display_name: cleanDisplayName, can_view_all_leads: canViewAllLeads }
              : c
          )
        );
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "変更に失敗しました。");
      }
    });
  }

  function remove() {
    if (!window.confirm(`「${company.name}」を削除しますか？`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteCompany(company.id);
        onChange(companies.filter((c) => c.id !== company.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "削除に失敗しました。");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className={`w-48 ${inputCls}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={company.is_home}
        title="正式名称"
      />
      <input
        className={`w-32 ${inputCls}`}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="表示名称（任意）"
        title="表示名称"
      />
      {company.is_home && (
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">自社</span>
      )}
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <input
          type="checkbox"
          checked={canViewAllLeads}
          onChange={(e) => setCanViewAllLeads(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
        />
        全リード閲覧
      </label>
      <button onClick={save} disabled={isPending || !isDirty} className={btnSecondarySmCls}>
        保存
      </button>
      {!company.is_home && (
        <button
          onClick={remove}
          disabled={isPending}
          className={`${btnSecondarySmCls} border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700`}
        >
          削除
        </button>
      )}
      {saved && <span className="text-xs font-medium text-emerald-600">保存しました</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

function MemberRow({
  me,
  member,
  roster,
  lastSignIn,
  companies,
}: {
  me: Profile;
  member: Profile;
  roster: Profile[];
  lastSignIn: string | null;
  companies: Company[];
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
  const homeCompany = companies.find((c) => c.is_home);
  const initialCompanyId =
    companies.find((c) => c.name === member.org_name)?.id ?? (member.org_name ? "" : homeCompany?.id ?? "");
  const [companyId, setCompanyId] = useState(initialCompanyId);
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
          ...(canChangeRole
            ? { role, org_name: companies.find((c) => c.id === companyId)?.name ?? null }
            : {}),
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
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="whitespace-nowrap">{member.email}</span>
          {member.is_owner && (
            <span className="whitespace-nowrap rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              オーナー
            </span>
          )}
        </span>
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
        {canChangeRole ? (
          <select className={`w-44 ${inputCls}`} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">未設定</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {companyLabel(c)}
              </option>
            ))}
          </select>
        ) : member.org_name ? (
          companyLabel(companies.find((c) => c.name === member.org_name) ?? { name: member.org_name, display_name: null })
        ) : (
          <span className="text-slate-300">—</span>
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
// 所属会社は、上の「会社の管理」で登録した一覧から選ぶ（ゲストの場合は該当の販売店を、
// 社内メンバーの場合は基本的に「ミライアゴーゴー」を選ぶ）。
function InviteMemberForm({ canGrantAdmin, companies }: { canGrantAdmin: boolean; companies: Company[] }) {
  const inviteRoles = ROLE_ORDER.filter((r) => canGrantAdmin || r !== "admin");
  const homeCompany = companies.find((c) => c.is_home);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [companyId, setCompanyId] = useState(homeCompany?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    setSentTo(null);
    startTransition(async () => {
      try {
        const companyName = companies.find((c) => c.id === companyId)?.name ?? null;
        const result = await inviteMember(email, role, companyName);
        setSentTo(result.email);
        setEmail("");
        setRole("staff");
        setCompanyId(homeCompany?.id ?? "");
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
          メールアドレスを入力すると、Supabaseから招待メールが届きます。相手がリンクからパスワードを設定すると、そのままログインできるようになります。ゲスト会社がまだ稼働していなくても、先に招待してリードを割り振っておくことができます。
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
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          所属会社
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`w-56 ${inputCls}`}>
            <option value="">未設定</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {companyLabel(c)}
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
