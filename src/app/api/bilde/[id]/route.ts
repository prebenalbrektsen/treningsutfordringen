import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";

// ?liten=1 gives the 200 px thumbnail used in lists (older photos without one get the full image).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return new Response("Ikke innlogget", { status: 401 });
  const { id } = await params;
  const small = new URL(request.url).searchParams.has("liten");
  const row = await one<{ data: Buffer; small: boolean; proof_mime: string }>(
    `select coalesce(case when $2 then proof_thumb end, proof_image) as data, ($2 and proof_thumb is not null) as small, proof_mime
       from workouts w where id = $1 and proof_image is not null
        -- Your own, or a checked-in workout of someone you share a group with.
        and (w.user_id = $3 or (w.checked_in_at is not null and exists (
          select 1 from group_members a join group_members b on b.group_id = a.group_id
           where a.user_id = $3 and a.approved and b.user_id = w.user_id and b.approved)))`,
    [Number(id), small, me.id],
  );
  if (!row) return new Response("Finnes ikke", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: { "content-type": row.small ? "image/webp" : row.proof_mime, "cache-control": "private, max-age=86400" },
  });
}
