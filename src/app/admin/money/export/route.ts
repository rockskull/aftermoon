import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/ledger";
import { getViewer, isOperator } from "@/server/auth/viewer";
import { loadMoney } from "@/server/money";

/** Ledger as CSV for operators (optionally one month: ?month=YYYY-MM). */
export async function GET(request: NextRequest) {
  const viewer = await getViewer({ fresh: true });
  if (!viewer || !isOperator(viewer.member)) return new NextResponse("Not found", { status: 404 });

  const month = request.nextUrl.searchParams.get("month") ?? "";
  const { entries } = await loadMoney();
  const picked = /^\d{4}-\d{2}$/.test(month) ? entries.filter((e) => e.date.startsWith(month)) : entries;
  const name = `aftermoon-ledger-${/^\d{4}-\d{2}$/.test(month) ? month : "all"}.csv`;

  return new NextResponse(toCsv(picked), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
