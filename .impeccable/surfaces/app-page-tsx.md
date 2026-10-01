---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/globals.css","components/FloodMap.tsx"]
---

# Flood reporting and monitoring web app

Scope: One responsive web app with five switchable views: home, submit report, flood map, latest reports, and CCTV. Mode: Operate.

Audience and job: Members of the public in Samut Prakan need to submit a local flood observation quickly and assess recent conditions before travelling. Success means clear report recency and water severity, with reports syncing across visitors. Preserve the specified report fields, severity colors, emergency contacts, district/subdistrict filters, and Thai-language content. Unresolved: production Supabase project credentials, verified CCTV feeds, and verified initial incident data.

## Direction contract

THESIS: A live flood bulletin should read like an operational timetable: each location is a time-stamped observation whose water status can be scanned, acted on, and confirmed. It refuses a generic stack of identical dashboard cards.

OWN-WORLD: Blue is the field's primary identity, with ink-navy navigation, bright blue controls, high-contrast white reading surfaces, and the requested six water-severity hues reserved for data. A disciplined rack of ivory report slides sits on blue, with exposed severity tabs and narrow status tracks; Thai UI lettering uses a locally self-hosted Anuphan face.

STORY: Visitors see the overall reporting pulse, choose to report or inspect conditions, then verify a location's latest observation and recency. A report can be confirmed as still flooded or marked receded; stale and disputed reports remain legible. On phones, the location row and its water state precede secondary detail.

FIRST VIEWPORT: A blue operations masthead and persistent five-destination navigation frame the home view. The opening blue bulletin carries the report action beside a six-row water-severity rack; the geographic map and latest-location list follow as the working area. The primary report action remains visible without scrolling on a phone.

FORM: Build the assigned pocket timetable slide-rack direction (candidate 4, seed key b33ed8aa), fused with the user's blue color commitment. Give report rows exposed severity tabs, fixed time/status columns, and a clearly materialized severity rack. Preserve readable Thai typography and true geographic map controls; do not imitate its single-size type or tilted prose panes where those would harm legibility.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
