# Event Board

A community event board on Homeroom. People post events with a title,
a date/time and a location, mark themselves Going with one tap, and see
who else is coming.

## What it does

- **Event list** — upcoming and past events on a filtered list. Each
  card shows the title, date/time, location and the Going count.
- **Event detail** — a Going toggle (one Going per person, tap again to
  cancel), the attendee list, and a reminder note with the start time.
- **Create event** — a short form validating the title (at least 3
  characters), a when and a where. Validation runs in the browser and
  again on the server.

## How it's built

- Node/Express server (`server.js`) with a private Postgres database.
  Two tables: `events` and `going` (unique on `(event_id, user_id)` so
  one Going per user is enforced by the schema, not just the UI).
- Sign-in is the platform-issued RS256 user token; no accounts in-app.
- Frontend is a single page (`public/index.html`) with three views on
  clean paths (`/`, `/new`, `/event/<id>`), styled with precompiled
  Tailwind (`npm run build` at image build). Light and dark themes
  follow the viewer's Homeroom setting via the platform bridge.
- Staging previews seed a few obviously-fake demo events ("Staging
  demo: …") so the screens are reviewable on an empty database.
