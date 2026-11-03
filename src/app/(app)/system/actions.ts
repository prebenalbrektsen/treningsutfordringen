"use server";

import { revalidatePath } from "next/cache";
import { newToken, requireSysadmin } from "@/lib/auth";
import { query } from "@/lib/db";

/** A one-time link that lets someone start a new group. The note is just for the overview. */
export async function createGroupInvite(form: FormData): Promise<void> {
  await requireSysadmin();
  const note = String(form.get("note") ?? "").trim().slice(0, 80) || null;
  await query("insert into group_invites (token, note) values ($1, $2)", [newToken(12), note]);
  revalidatePath("/system");
}

export async function revokeGroupInvite(token: string): Promise<void> {
  await requireSysadmin();
  await query("delete from group_invites where token = $1 and used_at is null", [token]);
  revalidatePath("/system");
}

/** Turn a group off (nobody in it sees it any more) or back on. Nothing is deleted. */
export async function toggleGroupDisabled(groupId: number): Promise<void> {
  await requireSysadmin();
  await query("update groups set disabled_at = case when disabled_at is null then now() end where id = $1", [groupId]);
  revalidatePath("/system");
}
