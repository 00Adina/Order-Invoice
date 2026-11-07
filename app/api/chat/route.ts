import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MAX_MESSAGE_LENGTH, SESSION_COOKIE, getChatState, handleCustomerMessage } from "@/lib/chat/service";
import { errorResponse, readSessionId, withSessionCookie } from "@/lib/chat/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const state = await getChatState(readSessionId(req.cookies.get(SESSION_COOKIE)?.value));
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({ message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
  }
  try {
    const { sessionId, state } = await handleCustomerMessage(
      readSessionId(req.cookies.get(SESSION_COOKIE)?.value),
      parsed.data.message,
    );
    return withSessionCookie(NextResponse.json(state), sessionId);
  } catch (err) {
    return errorResponse(err);
  }
}
