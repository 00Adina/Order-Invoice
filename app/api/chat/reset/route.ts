import { NextResponse } from "next/server";
import { startNewSession } from "@/lib/chat/service";
import { errorResponse, withSessionCookie } from "@/lib/chat/http";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { sessionId, state } = await startNewSession();
    return withSessionCookie(NextResponse.json(state), sessionId);
  } catch (err) {
    return errorResponse(err);
  }
}
