import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError as GeminiApiError } from "@google/genai";
import { NextResponse } from "next/server";
import { ConflictError } from "@/lib/chat/store";
import { LimitError, SESSION_COOKIE } from "@/lib/chat/service";
import { OrderError } from "@/lib/orders";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readSessionId(cookieValue: string | undefined) {
  return cookieValue && UUID_RE.test(cookieValue) ? cookieValue : undefined;
}

export function withSessionCookie(res: NextResponse, sessionId: string) {
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function errorResponse(err: unknown) {
  if (err instanceof LimitError) return NextResponse.json({ error: err.message }, { status: 429 });
  if (err instanceof ConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
  if (err instanceof OrderError) return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
  if (err instanceof Anthropic.RateLimitError) {
    return NextResponse.json({ error: "The assistant is busy right now. Please try again in a moment." }, { status: 429 });
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    console.error("[chat] Anthropic credentials rejected", err.message);
    return NextResponse.json({ error: "The assistant is not configured correctly." }, { status: 500 });
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[chat] Anthropic API error", err.status, err.message);
    return NextResponse.json({ error: "The assistant is temporarily unavailable. Please try again." }, { status: 502 });
  }
  if (err instanceof GeminiApiError) {
    console.error("[chat] Gemini API error", err.status, err.message);
    if (err.status === 429 || err.status === 503) {
      return NextResponse.json({ error: "The assistant is busy right now. Please try again in a minute." }, { status: 429 });
    }
    if (err.status === 400 || err.status === 401 || err.status === 403 || err.status === 404) {
      return NextResponse.json({ error: "The assistant is not configured correctly." }, { status: 500 });
    }
    return NextResponse.json({ error: "The assistant is temporarily unavailable. Please try again." }, { status: 502 });
  }
  console.error("[chat] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
