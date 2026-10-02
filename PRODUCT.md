# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Next.js with TypeScript, Supabase for shared realtime reports and optional image storage, and Vercel for deployment.

## Users

Residents and other members of the public in Samut Prakan who need to report local flood conditions and check current conditions nearby.

## Product Purpose

Collect and share recent, location-based water-level reports across Samut Prakan so people can understand local flood conditions and make more informed travel and safety decisions.

## Operating Context

People may use the site on a phone while checking a flooded area or while planning a trip. They can submit a report using their current location, a map location, or a pasted map/location link, then browse reports by map and administrative area.

## Capabilities and Constraints

- Reports include water depth category, trend, passable vehicle types, optional notes, and optional photos.
- Reports can be confirmed as still flooded or receded; users can flag inaccurate or stale information.
- Public report data should synchronize across visitors in real time using a hosted backend.
- The site includes current reports, a report map with nearby official canal monitoring stations and an optional selectable hourly rainfall forecast layer, district/subdistrict filtering, public CCTV discovery, and emergency contacts.
- Production Supabase credentials were not provided and must be configured before cross-user live reports are available.
- Hourly rainfall forecasts are served by Open-Meteo with attribution and a 30-minute cache; precipitation is forecast weather data, not a flood-depth or road-passability measurement. The free API tier is for non-commercial use.
- Nearby canal station status, measurement, thresholds, and history are sourced from the Bangkok Drainage and Sewerage Department. Levels are reported in meters above mean sea level, not canal depth; the source page currently exposes about 48 hours of history. The data catalog specifies non-commercial reuse.
- The currently verified public CCTV feeds in the Longdo Traffic camera directory for Samut Prakan are two Highway Department HLS cameras near Bang Na–Bang Pakong km 6, one in each direction. Unverified or non-public CCTV locations are excluded from the public-facing list.
- Initial illustrative flood reports must be identified as sample/demo content until replaced with live reports.

## Brand Commitments

Thai-language experience with blue as the primary visual theme; modern, clear, and easy to use on mobile.

## Evidence on Hand

Emergency contact names and numbers are supplied in the original product brief. Hourly precipitation forecasts are available from Open-Meteo and are rendered as an optional map layer. Canal station data for Samut Prakan and connected upstream areas is available from the Bangkok Drainage and Sewerage Department's public water-monitoring site. The two currently listed public CCTV HLS feeds from the Highway Department are linked through Longdo Traffic; the Samut Prakan provincial CCTV page provides policy documents rather than public live streams. No production incident feed or Supabase project credentials were provided, and the initial map reports are still sample content.

## Product Principles

- Make recent local conditions easy to understand at a glance.
- Keep reporting short enough to complete on a mobile device.
- Show when information was reported and how its state changes over time.
- Treat unverified feeds and sample reports transparently.
- Keep emergency contact details easy to find.
