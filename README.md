# weshop

Bilingual (French/Arabic) cash-on-delivery e-commerce storefront and admin dashboard, built with
TanStack Start (React 19 + Vite 8) and Supabase.

## Stack

- **Frontend/SSR:** TanStack Start + TanStack Router + TanStack Query, React 19, Tailwind CSS 4, shadcn/ui, Lucide icons.
- **Backend:** own Supabase project — Postgres with RLS, SECURITY DEFINER RPCs, Supabase Auth, Supabase Storage (private `catalog` and `return-photos` buckets).
- **AI:** OpenAI (Responses API via the Vercel AI SDK), admin-only product description writer.
- **Tests:** Vitest.

## Setup

### 1. Environment

```sh
cp .env.example .env
```

Fill in `.env`:

| Variable                        | Where to find it                                | Used by                                         |
| ------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `SUPABASE_URL`                  | Supabase → Project Settings → API → Project URL | server functions, SSR                           |
| `VITE_SUPABASE_URL`             | same value                                      | browser bundle                                  |
| `SUPABASE_PUBLISHABLE_KEY`      | Project Settings → API keys → publishable key   | server functions, SSR                           |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same value                                      | browser bundle                                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Project Settings → API keys → secret key        | server-only admin client (optional)             |
| `OPENAI_API_KEY`                | platform.openai.com                             | AI product descriptions (server-only, optional) |
| `AI_MODEL`                      | defaults to `gpt-4.1-mini`                      | AI product descriptions                         |

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are also accepted (Vite's
`envPrefix` exposes them) for compatibility with copy-pasted snippet names.

### 2. Database

The full schema, RLS policies, RPCs, storage buckets and demo seed data live in
`supabase/migrations/`.

Either apply them with the Supabase CLI:

```sh
npx supabase login                # once, or set SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref <project-ref>
npm run db:push
```

…or, without any CLI login, paste `supabase/bootstrap.sql` into
**Supabase Dashboard → SQL Editor** and run it once.

Then regenerate the typed client (requires `SUPABASE_ACCESS_TOKEN` or a linked project):

```sh
npm run db:types
```

After that, sign up in the app, open `/admin-setup` and claim the first administrator account.

### 3. Authentication settings

In Supabase → Authentication:

- Set **Site URL** to your app URL and add `http://localhost:8080` / your production URL to **Redirect URLs**.
- Google sign-in is optional: enable the Google provider with your own OAuth client, otherwise leave it (the button will return a provider error).
- For local development, turning off **Confirm email** makes sign-up instant; in production configure SMTP.

## Development

```sh
npm install
npm run dev        # http://localhost:8080
npm run build
npm run start      # run the built server
```

Useful scripts:

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run lint`      | ESLint                                               |
| `npm run typecheck` | `tsc --noEmit`                                       |
| `npm test`          | Vitest                                               |
| `npm run db:push`   | Apply `supabase/migrations` to the linked project    |
| `npm run db:diff`   | Diff local migrations against the linked database    |
| `npm run db:types`  | Regenerate `src/integrations/supabase/types.ts`      |
| `npm run db:bundle` | Rebuild `supabase/bootstrap.sql` from the migrations |

## Project docs

- Agent/contributor rules: [AGENTS.md](./AGENTS.md)
- Build roadmap: [roadmap.md](./roadmap.md)
