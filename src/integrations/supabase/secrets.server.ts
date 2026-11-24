/**
 * Server-only secrets and provider settings.
 *
 * `dotenv/config` loads the local `.env` file into `process.env` during
 * development/SSR so secrets never have to be Vite-prefixed (and therefore can
 * never be inlined into the browser bundle). In production, set these values in
 * the hosting provider's environment instead.
 *
 * Never import this module from client code.
 */
import "dotenv/config";

export function supabaseServiceRoleKey(): string | undefined {
  return process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_SECRET_KEY"];
}

export function openAiApiKey(): string | undefined {
  return process.env["OPENAI_API_KEY"];
}

export function aiModel(): string {
  const model = process.env["AI_MODEL"]?.trim();
  return model && model.length > 0 ? model : "gpt-4.1-mini";
}
