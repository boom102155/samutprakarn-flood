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
- The site includes current reports, a report map, district/subdistrict filtering, CCTV discovery, and emergency contacts.
- Production Supabase credentials were not provided and must be configured before cross-user live reports are available.
- Two public Highway Department HLS camera feeds near Bang Na–Bang Pakong km 6 are configured through Longdo Traffic; other CCTV location entries remain sample locations until verified feeds are supplied.
- Initial illustrative flood reports must be identified as sample/demo content until replaced with live reports.

## Brand Commitments

Thai-language experience with blue as the primary visual theme; modern, clear, and easy to use on mobile.

## Evidence on Hand

Emergency contact names and numbers are supplied in the original product brief. Two public CCTV HLS feeds from the Highway Department are linked through Longdo Traffic; no production incident feed or Supabase project credentials were provided, and the initial map reports are still sample content.

## Product Principles

- Make recent local conditions easy to understand at a glance.
- Keep reporting short enough to complete on a mobile device.
- Show when information was reported and how its state changes over time.
- Treat unverified feeds and sample reports transparently.
- Keep emergency contact details easy to find.
