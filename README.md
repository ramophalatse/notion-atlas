# Ramo's workspace atlas

A static, interactive map of Ramo's personal Notion workspace, published with GitHub Pages. Inspired by Pav Rusovs' *Turn Claude Code Into Your AI Operating System (4 Layers)*, especially the interface walkthrough at 00:50–02:40.

Six layouts use the same graph: Rings, Circle, Areas, Links, Timeline and 3D orbit. Search and area filters narrow the graph. Select a node to inspect its evidence and connections, then open its original Notion link. The Directory exposes the same objects as keyboard-accessible buttons. Themes persist locally. Reduced-motion settings stop the orbit animation. Background tabs pause rendering.

## Snapshot scope

Captured 5 November 2026 from the connected personal Notion workspace. The snapshot covers 16 selected entry points and their direct page/database references, plus available relation schemas. It contains 165 workspace objects, 54 relation targets outside the snapshot and 667 reference/relation edges. This is an architecture map, not a complete crawl of database records or a live synchronisation service.

The entry points span the two separate migrated PYLOS copies, the pre-existing Essential Edition, Travel, Home, My Year, Mothership, Achievement Blueprint, cigar and whisky collections, Nedbank, Maru, Open Engine, and selected finance systems. Both migrated PYLOS copies remain separate; this map makes no canonical-system or migration-signoff decision.

- A reference edge means a page embeds or links another object. It does not prove parenthood.
- A relation edge describes a property in a database schema. It does not prove populated record relationships.
- An outside-snapshot target was not fetched. It is not proven broken.
- An untitled linked view with no returned data source is preserved as observed. It is not repaired here.
- The Timeline uses available last-edited metadata. Missing dates remain undated. It is not an event log.
- Area assignments are editorial navigation choices.

## Public data boundary

Ramo explicitly authorised public page titles and Notion links for this map. Published data contains object identifiers, titles, source links, selected edit metadata and structural relationships. Page bodies, database record values, financial amounts, credentials, private email addresses and signed attachment URLs are excluded. Opening a source link still requires its existing Notion permissions.

The browser makes no calls to Notion. Google Fonts supplies Sora, Hanken Grotesk and JetBrains Mono. There are no third-party JavaScript packages, analytics, API credentials or runtime back end.

## Files and maintenance

- `index.html`, `style.css`, `app.js`: static interface.
- `data.json`: normalised, metadata-only graph and provenance.
- `data.js`: the same graph as a script payload, so the page also works from a local file.
- `scripts/build_snapshot.py`: normalises a local connector-fetch bundle into both data files. The fetch bundle stays outside the repository because it may include page bodies and schemas.
- `scripts/check_snapshot.py`: checks graph integrity, public field allowlists and exact agreement between both data files.

The input bundle contains `roots` (ordered object IDs), `fetched` (ID to Notion fetch structured content), and `refs` (entry ID to direct page/database references). Root IDs come from that bundle; their group assignments are explicit in the generator and follow the same order. Update those assignments with any scope changes. Refresh by reading current Notion metadata through an authenticated connector, writing a local bundle, regenerating both data files, reviewing the metadata-only diff, and publishing the reviewed change. No refresh schedule is installed.

## Hosting and design

GitHub Pages serves the repository's root on the `main` branch. `.nojekyll` keeps the output static. The map also works with any static file server or by opening `index.html` locally.

Uses Ramo's personal brand: warm-paper/deep blue-charcoal surfaces, emerald accent, Sora display, Hanken Grotesk body, JetBrains Mono labels, 18px cards, alpha borders, fixed 56px gradient ghost text, a persistent theme switch and reduced-motion support. The workspace canvas uses a wider application frame than the 1080px prose default; prose remains constrained. Domain hues are local to this map and use the shared OKLCH curve.

Implementation checks and visual inspection do not replace Ramo's own visual acceptance.
