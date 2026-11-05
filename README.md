# Ramo's workspace atlas

An interactive map of Ramo's personal Notion workspace. GitHub Pages hosts the interface; a dedicated Netlify service reads Notion and supplies current public metadata. Six layouts share one graph: Rings, Circle, Areas, Links, Timeline and 3D orbit.

## Automatic updates

The dedicated **Workspace Atlas (read-only)** Notion connection belongs to Ramo Phalatsi's Notion, workspace `c707d4a0-0026-4c58-8d82-00798c651083`. Creation, updates, comments, agents and user-profile access are disabled. Its verified webhook subscription listens for page, database, data-source and view changes.

- Signed deletion events immediately hide the object and known descendants from the public feed. Open maps check that feed every 15 seconds.
- Structural events trigger a fresh read. Notion normally delivers events within a minute, but documents a window of up to five minutes; a full structural read adds processing time.
- A scheduled check every five minutes recovers from missed events and reconciles restored pages. Conditional storage leases prevent concurrent crawls; changes during a crawl request another pass.
- Maps update their graph, directory, entry points, counts and details without reloading. View, search, filters, theme, zoom and pan persist. Hidden tabs pause polling and check when visible again.
- The interface shows the last successful check and reports delayed or unavailable sync. Failures retain the last available graph with a visible saved-map status.

The service runs independently of this computer. No Notion credential is in GitHub Pages, the public repository or browser requests.

## Scope and public data

`atlas-scope.json` defines selected entry points, editorial areas and eight already-mapped supplemental Travel databases. Deleted or inaccessible objects are excluded. The deleted PYLOS copy and its 21 deleted descendants are excluded; the separate active PYLOS (Ramo) remains. New references on selected entries are discovered automatically. Another top-level entry point needs an explicit scope change and connection access. This is not a crawl of every workspace page or record.

Ramo authorised public titles, identifiers, Notion links, available edit metadata and structural relationships. Page bodies, record values, amounts, profiles, emails, signed attachment URLs and credentials are excluded. Page content is processed transiently to extract structure, never persisted. No database record queries run.

Reference edges mean linked or embedded objects, not proven parenthood. Relation edges describe schemas, not populated record links. Notion omits relation properties when their targets are not shared with the connection, so live counts can differ from the earlier connector snapshot. Unsupported non-page blocks are omitted. Previously identified linked views keep their last observed title only while their block remains accessible, with an explicit evidence label. Their title or source may not be exposed in full by the API. Timeline uses available edit metadata and is not an activity log. Source links retain Notion permissions.

## Components

- `index.html`, `style.css`, `app.js`: interface and graph layouts.
- `sync.js`: public-feed polling, validation, visibility handling and status.
- `data.json`, `data.js`: identical metadata-only fallback graphs for outages and local files.
- `atlas-scope.json`: stable ID-to-area assignments. The deleted root remains eligible if restored.
- `lib/notion.mjs`: read-only client, structural extraction, schema graph, field allowlist and descendant removal.
- `lib/sync.mjs`: private persistent state, conditional lease, event verification and reconciliation.
- `netlify/functions/atlas-data.mjs`: public metadata feed with no-store caching.
- `netlify/functions/atlas-webhook.mjs`: signed notifications; subscription bootstrap requires a private setup nonce.
- `netlify/functions/atlas-refresh-background.mjs`: authenticated background refresh.
- `netlify/functions/atlas-scheduled.mjs`: five-minute recovery trigger, configured in `netlify.toml`.
- `scripts/refresh-local.mjs`: local refresh, writing fallback payloads only with its explicit write flag.
- `scripts/build_snapshot.py`: legacy connector-bundle normalisation using stable root/group mapping.
- `scripts/check_snapshot.py`, `tests/sync.test.mjs`: graph/privacy agreement, deletions, failure handling and webhook checks.

Backend: `ramo-notion-atlas-sync`, Netlify site ID `c7f70978-be38-47e1-b132-3276f3b14542`. GitHub Pages still serves the repository root from `main`. Deploy the backend separately after server or scope changes. Use Node 22.12 or later.

## Credentials and maintenance

Netlify environment variables hold `NOTION_TOKEN`, `ATLAS_SYNC_SECRET` and `ATLAS_SETUP_SECRET`. These are standard private environment variables; this plan does not support additional secret-value/scope restrictions. Never put values in source, publish directories or build output. Owner-only local recovery configuration is outside the repository in the user's config directory.

The private `atlas-sync` Blob store holds the public graph, parent IDs, deletion markers, health, a lease, event revision and webhook signing token. The public handler returns only the graph and safe status. Failed API reads retain the previous complete graph and flag delayed sync. Logs contain event types/status, never bodies or tokens. Recreating a webhook subscription requires an authenticated administrative replacement of its private signing token; the public handshake cannot overwrite it.

After access changes or token rotation, update the dedicated connection and redeploy. Keep the public field allowlist intact. Do not query records or expand published scope during routine maintenance. Brand styling, fonts, themes and reduced-motion behaviour remain in place. Technical verification does not replace Ramo's visual acceptance.
