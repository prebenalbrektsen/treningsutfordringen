import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return new Response("Ikke innlogget", { status: 401 });
  const { id } = await params;
  // Only people who share a group (admins also see people waiting to join).
  const row = await one<{ avatar: Buffer }>(
    `select u.avatar from users u where u.id = $1 and u.avatar is not null and (u.id = $2 or exists (
       select 1 from group_members a join group_members b on b.group_id = a.group_id where a.user_id = $2 and b.user_id = u.id))`,
    [Number(id), me.id],
  );
  if (!row) return new Response("Finnes ikke", { status: 404 });
  // The URL carries ?v=<updated time>, so a new picture gets a new URL and this can be cached hard.
  return new Response(new Uint8Array(row.avatar), { headers: { "content-type": "image/webp", "cache-control": "private, max-age=31536000, immutable" } });
}
