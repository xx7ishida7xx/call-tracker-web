import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { canManageMembers } from "@/lib/types";
import { getPhpOverview } from "./actions";
import PhpCheckClient from "./PhpCheckClient";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export default async function PhpCheckPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  if (!canManageMembers(me)) redirect("/leads");
  const overview = await getPhpOverview();
  return <PhpCheckClient overview={overview} />;
}
