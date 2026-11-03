import { currentUser } from "@/lib/auth";
import { badgesFor } from "@/lib/badges";

/** Fresh tab-bar numbers; the bar asks after every page change, so badges clear once you've looked. */
export async function GET() {
  const user = await currentUser();
  if (!user || !user.approved || !user.group_id) return new Response(null, { status: 401 });
  return Response.json((await badgesFor({ ...user, group_id: user.group_id })).badges, { headers: { "cache-control": "no-store" } });
}
