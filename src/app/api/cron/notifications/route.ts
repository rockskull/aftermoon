import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getClubData } from "@/lib/club-data";
import { deliverDue, generateScheduled } from "@/server/notify";
import { PRIVATE_TAG, storeMode } from "@/server/store";

/**
 * Notification scheduler. Called by Vercel Cron (daily, see vercel.json) and,
 * optionally, by the Apps Script time trigger every 15 minutes for timelier
 * event notices. Both send `Authorization: Bearer <CRON_SECRET>`.
 * Every step is idempotent, so overlapping or repeated calls are harmless.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (storeMode() === "unconfigured") return NextResponse.json({ ok: false, error: "store not configured" }, { status: 503 });

  const now = Date.now();
  try {
    const feed = await getClubData();
    const created = feed.source === "error" ? 0 : await generateScheduled(now, feed.events);
    const delivery = await deliverDue(now);
    revalidateTag(PRIVATE_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, created, ...delivery, eventsChecked: feed.source !== "error" });
  } catch (error) {
    console.error("[cron] notifications failed:", error);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
