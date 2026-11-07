import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, confirmFromButton } from "@/lib/chat/service";
import { errorResponse, readSessionId } from "@/lib/chat/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sessionId = readSessionId(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sessionId) return NextResponse.json({ error: "No active chat." }, { status: 400 });
  try {
    return NextResponse.json(await confirmFromButton(sessionId), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
