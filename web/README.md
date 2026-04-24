# VoiceBridge Website

Landing page + waitlist application for VoiceBridge.

## Features

- Launch-style marketing landing page
- Embedded demo video: `https://www.youtube.com/watch?v=TNiw3K0_gpU`
- Waitlist form (`name`, `email`)
- Supabase-backed API route: `POST /api/waitlist`

## Start Local

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- optional: `SUPABASE_WAITLIST_TABLE` (defaults to `waitlist_signups`)

4. Create table in Supabase SQL editor:

```sql
-- file: supabase/waitlist_signups.sql
create table if not exists public.waitlist_signups (
  id bigserial primary key,
  name text not null check (char_length(name) between 2 and 80),
  email text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists waitlist_signups_email_unique
  on public.waitlist_signups (lower(email));
```

5. Start dev server:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3024
```

6. Open:

`http://127.0.0.1:3024`

## Production Local Check

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3024
```

## Push To GitHub

From the repo root (`/Users/shrey/Documents/voicebridge`):

```bash
git add VoiceBridge-Website/README.md
git commit -m "docs: add local run and push guide"
git push origin main
```
