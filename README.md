# Ledgerly

Ledgerly is a frontend-only sales and expense PWA backed by Supabase. Sales and expenses are stored in separate database tables.

## Setup

1. Create a Supabase project.
2. Run [`supabase-schema.sql`](./supabase-schema.sql) in Supabase SQL Editor. It creates separate `sales` and `expenses` tables. If you previously ran the older schema, it migrates existing rows from `transactions`.
3. In **Authentication > Providers > Email**, enable Email and turn off **Confirm email** if you want users to enter the app immediately after creating an account. With confirmation disabled, Supabase creates the session directly after sign-up.
4. Copy `supabase-config.js.example` to `supabase-config.js` and add the project URL and public anon key. The config file is ignored by git.
5. Serve this folder from a local web server (for example `npx serve .`) rather than opening `index.html` directly. HTTPS (or localhost) is required for PWA installation.

The app uses Supabase Auth, Row Level Security, and database tables for all shop settings and transactions. Never put a Supabase `service_role` key in the browser.
