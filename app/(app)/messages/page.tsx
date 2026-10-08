import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isGuestRole, nameFor, type Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { cardCls } from "@/lib/ui";

// 自分宛のコメント（メッセージ）の一覧。未読を上に強調して表示する。
// リードを開くと、そのリード宛の未読は既読になる。
export default async function MessagesPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  if (isGuestRole(me.role)) redirect("/leads");

  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_comments")
    .select(
      "id, lead_id, body, created_at, read_at, author:profiles!lead_comments_author_id_fkey(id,name,display_name,email), lead:leads(id, company)"
    )
    .eq("to_profile_id", me.id)
    .order("created_at", { ascending: false })
    .limit(100);

  type Row = {
    id: string;
    lead_id: string;
    body: string;
    created_at: string;
    read_at: string | null;
    author: Pick<Profile, "id" | "name" | "display_name" | "email"> | null;
    lead: { id: string; company: string } | null;
  };
  const rows = (data as unknown as Row[]) ?? [];
  const unread = rows.filter((r) => !r.read_at);
  const read = rows.filter((r) => r.read_at);

  function Item({ r }: { r: Row }) {
    return (
      <li>
        <Link
          href={`/leads/${r.lead_id}`}
          className={`block rounded-xl border px-4 py-3 transition hover:border-orange-300 ${
            r.read_at ? "border-slate-200 bg-white" : "border-orange-300 bg-orange-50"
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {!r.read_at && <span className="rounded-full bg-orange-500 px-2 py-0.5 font-semibold text-white">未読</span>}
            <span className="font-semibold text-slate-800">{r.lead?.company || "（会社名未登録）"}</span>
            <span>・{r.author ? nameFor(r.author) : "不明なメンバー"}さんから</span>
            <span>{formatDateTime(r.created_at)}</span>
          </div>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{r.body}</p>
        </Link>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">自分宛のメッセージ</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          リードのコメントで、あなたが宛先にされたものです。リードを開くと既読になります。
        </p>
      </div>

      <section className={`${cardCls} p-5`}>
        <h2 className="mb-3 text-sm font-bold text-slate-700">未読（{unread.length} 件）</h2>
        {unread.length === 0 ? (
          <p className="text-sm text-slate-400">未読のメッセージはありません</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unread.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>

      {read.length > 0 && (
        <section className={`${cardCls} p-5`}>
          <h2 className="mb-3 text-sm font-bold text-slate-700">既読（直近 {read.length} 件）</h2>
          <ul className="flex flex-col gap-2">
            {read.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
