# Tamales & More

A responsive ordering site for tamales and sides, with customer accounts and a kitchen admin dashboard. Built with React, Vinext, TypeScript, Cloudflare Workers, D1, and Drizzle.

## Features

- Order tamales by the dozen plus extra singles, including custom quantities above ten dozen.
- Add sides by their own unit, such as an order, tray, or container.
- Save drafts, resume them, submit named orders with contact details, and reorder previous selections.
- Track submitted orders as **In progress** or **Completed**. Drafts remain separate until submitted.
- Manage menu items, prices, availability, customer accounts, and administrator roles.
- Export all or filtered orders as CSV, and print individual orders.
- Preserve item names, units, and prices on submitted orders when the menu changes.

Initial menu prices are $30 per dozen / $2.50 each for standard tamales, $36 per dozen / $3 each for beef, and $18 per corn order. Administrators can change these rates. Corn is a separate side and does not count toward the tamale total.

## Local setup

Requires Node.js 22.13 or newer and npm. Run commands from the project root.

```sh
npm run install:ci
npm run build
```

Create a local `.dev.vars` file containing:

```dotenv
ADMIN_EMAILS=seedy@sites.test
```

Apply the initial migration to a fresh local database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_known_owl.sql
```

Apply each later migration once, in order. Do not replay an already-applied migration. Local database records are separate from hosted data.

Start the development server:

```sh
npm run dev -- --hostname 127.0.0.1
```

Open the printed local URL, normally `http://127.0.0.1:5173`. Use the sign-in link to simulate the development account `seedy@sites.test`. The local mock is restricted to loopback development and is excluded from production builds.

## Sign-in and administrator access

Hosted sign-in is provided by ChatGPT through Sites. The application uses the platform's verified identity, stores account roles in D1, and checks ownership or administrator access on the server. It does not store user passwords.

Set the runtime `ADMIN_EMAILS` variable to a comma-separated list of initial administrator email addresses before their first sign-in. Its value belongs in the hosting environment, not the source repository. `.env.example` documents the variable without a value.

After account creation, the stored role controls access. Revoking administrator access is not undone by `ADMIN_EMAILS`. Administrators cannot remove their own access, and the server protects the last signed-in administrator. Accounts added in the People panel are linked when the person signs in with the matching email; adding an account does not send an invitation email.

A private site's hosting access policy is separate from application roles. Granting an admin role does not itself make a private site public or grant hosting access.

## Development and tests

```sh
node node_modules/typescript/bin/tsc --noEmit
node --test tests/backend.test.mjs tests/admin-export.test.mjs
npm run build
```

With the local development server and local administrator configured, run API integration checks in a separate terminal:

```sh
node tests/integration.mjs
```

The integration runner targets only `http://127.0.0.1:5173`. It creates clearly named QA records in the local database, verifies pricing and access rules, then hides its test side and revokes the test account's admin role. Test orders remain local for inspection.

To change the schema, edit `db/schema.ts`, run `npm run db:generate`, review the generated SQL, rebuild, and apply only the new local migration. Preserve previously applied migration files and metadata.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/OrderBuilder.tsx` | Storefront, quantities, contact form, and order review |
| `app/orders/` | Customer drafts and order history |
| `app/admin/` | Order processing, menu management, people, and exports |
| `app/api/` | Protected customer and admin endpoints |
| `app/lib/` | Catalog, account handling, validation, and pricing |
| `db/` and `drizzle/` | Database schema and migrations |
| `worker/` | Production Worker entry point |
| `.openai/hosting.json` | Existing Site identity and D1 binding |
| `tests/` | Validation, export, and local API checks |

## Hosting

This repository retains the existing Sites project identity in `.openai/hosting.json` and uses the `DB` D1 binding. Production publishing through Sites applies the database migrations and supplies authentication. `npm run build` produces the deployment output; `npm start` previews that built Worker locally without mock sign-in.

Cloning the repository does not copy database records, administrator settings, or runtime secrets. An independent deployment must provision its own database and trusted authentication integration; the platform identity headers must not be accepted directly from untrusted clients.

Local environment files, credentials, dependencies, database state, generated builds, and test output are excluded from version control. The only bundled visual asset is the simple SVG logo/favicon.
