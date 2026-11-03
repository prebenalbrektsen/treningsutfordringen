import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";

// A tiny «has anything changed?» check for live screens. Returns a short fingerprint; the screen
// only re-renders when it differs from last time. ?hva=prat (newest message) or ?hva=godkjent.
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const what = new URL(request.url).searchParams.get("hva");
  let tag = "";
  if (what === "prat") {
    const row = await one<{ tag: string }>("select coalesce(max(id), 0) || ':' || count(*) as tag from messages where group_id = $1", [user.group_id]);
    tag = row!.tag;
  } else if (what === "godkjent") {
    tag = user.approved ? "ja" : "nei";
  }
  return Response.json({ tag }, { headers: { "cache-control": "no-store" } });
}
