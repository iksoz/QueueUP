# QueueUP

QueueUP is a mobile-first live queue for shared courts. Players choose a display name, join a court, and move onto the court when they reach the front of the line. Admins can create courts, add walk-ins, and remove players when needed.

The app is built for Cloudflare Sites with Vinext and stores shared state in Cloudflare D1.

## Features

- Live court occupancy and queue order across devices
- Four on-court spots per court
- First-in, first-on queue enforcement on the server
- One active court membership per player
- Device-local player profiles with editable display names
- Admin mode for creating courts, adding walk-ins, and removing players
- Automatic refresh every five seconds
- Four default courts created when an empty database is first opened
- Browser model-context tools for listing courts and joining a queue

## Queue rules

1. A player can belong to only one court at a time.
2. Joining places the player at the back of that court's queue.
3. Only the first queued player can hop on, and only when fewer than four players are on court.
4. Hopping off returns the player to the back of the same queue.
5. Leaving removes the player from both the court and its queue.

These rules are enforced by the API and database constraints, not only by the interface.

## Tech stack

- Next.js 16 and React 19
- [Vinext](https://github.com/cloudflare/vinext) and Vite
- Cloudflare Workers and D1
- Drizzle ORM and Drizzle Kit
- Tailwind CSS 4 and shadcn/ui
- TypeScript

## Local setup

### Prerequisites

- Node.js 22.13 or newer
- pnpm 11 (the version is pinned in `package.json`)

### 1. Install dependencies

```sh
pnpm install --frozen-lockfile
```

### 2. Configure admin access

Copy `.dev.vars.example` to `.dev.vars` and replace each placeholder:

```dotenv
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=use-a-strong-password
ADMIN_SESSION_SECRET=generate-at-least-24-random-characters
```

`.dev.vars` is ignored by Git. Keep these values secret and use different credentials in production.

### 3. Prepare the local D1 database

Build once to generate the Wrangler configuration, then apply the initial migration:

```sh
pnpm build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clammy_the_renegades.sql
```

Run each future migration once, in filename order. Local D1 data is stored under `.wrangler/state/`.

### 4. Start the app

```sh
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). To use another port:

```sh
pnpm dev -- --port 3000
```

## Using QueueUP

### Players

On the first visit, enter a display name. QueueUP saves a randomly generated player ID and the display name in browser local storage. From the court screen, a player can:

- browse every court and its current line;
- join an available court queue;
- hop on when first in line and a spot is open;
- hop off and return to the back of the line;
- leave the court entirely; and
- edit their display name from the profile button.

### Admins

Select **Admin** and sign in with the credentials configured in `.dev.vars`. Admin mode can:

- create a court;
- add a walk-in player to the back of a queue; and
- remove a queued or playing member.

Admin sessions use an HTTP-only, HMAC-signed cookie that expires after eight hours.

## API

Queue state is exposed through `app/api/courts/route.ts`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/courts` | Return the current user and all courts, players, and queues |
| `POST` | `/api/courts` | Run `join`, `leave`, `hopOn`, `hopOff`, `createCourt`, `addPlayer`, or `kickPlayer` |
| `POST` | `/api/admin/login` | Validate admin credentials and create a session |
| `POST` | `/api/admin/logout` | Clear the admin session |

Player requests include `x-queueup-player-id` and `x-queueup-player-name`, populated from the local profile. These headers provide lightweight device identity for the current MVP; they should not be treated as strong authentication for a hostile public deployment.

## Data model

The D1 schema lives in `db/schema.ts`:

- `users` stores player and admin identities.
- `courts` stores unique court names.
- `memberships` connects a user to one court as either `queued` or `playing`.

The unique index on `memberships.user_id` guarantees that a player cannot occupy or queue for multiple courts at once.

After changing the schema, generate a migration with:

```sh
pnpm db:generate
```

Review the generated SQL before applying it locally or in production.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vinext development server with HMR |
| `pnpm build` | Build the deployable Worker artifact |
| `pnpm start` | Preview the built Worker locally on `127.0.0.1` |
| `pnpm lint` | Run ESLint |
| `pnpm db:generate` | Generate Drizzle migrations from the schema |

`pnpm start` requires a completed build and uses the same `.wrangler/state` directory as development.

## Project structure

```text
app/
  api/                  API routes for courts and admin sessions
  queue-app.tsx         Main client interface and queue actions
components/ui/          Reusable UI components
db/
  schema.ts             Drizzle schema
  store.ts              D1 binding access
drizzle/                SQL migrations
lib/admin-session.ts    Admin credential and cookie handling
.openai/hosting.json    Cloudflare Sites bindings
```

## Deployment

The Sites configuration declares a D1 binding named `DB` in `.openai/hosting.json`. Before publishing:

1. Configure `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` as production secrets.
2. Apply every migration in `drizzle/` to the production D1 database.
3. Build and publish through the Cloudflare Sites workflow.

Do not commit `.dev.vars`, `.wrangler/`, `.sites-runtime/`, or generated build output.

## Current scope

QueueUP intentionally keeps the first release small. Multi-court queuing, court renaming or deletion, admin management, and game/session history are not implemented yet. See [PLAN.md](PLAN.md) for the product plan.
