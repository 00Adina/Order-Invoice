import "server-only";
import { z } from "zod";

/** Treat empty strings (common when a variable is added in a dashboard but left blank) as unset. */
const optional = (schema: z.ZodType<string>) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const ServerEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  /** "gemini" (free tier available) or "anthropic". Defaults to whichever key is set. */
  AI_PROVIDER: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["gemini", "anthropic"]).optional()),

  ANTHROPIC_API_KEY: optional(z.string().min(10)),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),

  GEMINI_API_KEY: optional(z.string().min(10)),
  // If this id isn't available for the key, the app picks the best available Flash model automatically.
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_BASE_URL: optional(z.url()),

  CHAT_MAX_MESSAGES_PER_SESSION: z.coerce.number().int().positive().default(60),
});

export type ServerEnv = z.infer<typeof ServerEnv>;
let cached: ServerEnv | null = null;

/** Validated server environment. Throws a readable error listing missing variables. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnv.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${keys}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export type AiProvider = "gemini" | "anthropic";

export function aiProvider(env = serverEnv()): AiProvider {
  if (env.AI_PROVIDER) return env.AI_PROVIDER;
  if (env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY) return "gemini";
  return "anthropic";
}
