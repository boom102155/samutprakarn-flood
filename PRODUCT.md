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
- The site includes current reports, a report map with optional ThaiWater level stations and a selectable hourly rainfall forecast layer, district boundaries, district/subdistrict filtering, public CCTV discovery, emergency contacts, and opt-in LINE OA weather warnings for subscribed Samut Prakan locations.
- Production Supabase credentials were not provided and must be configured before cross-user live reports are available.
- Hourly rainfall forecasts are served by Open-Meteo with attribution and a 30-minute cache; precipitation is forecast weather data, not a flood-depth or road-passability measurement. The free API tier is for non-commercial use.
- ThaiWater provides river and canal station readings, locations, update times, and available bank/warning thresholds for Samut Prakan. Readings older than 24 hours are marked stale; levels are reported in meters above mean sea level.
- The initial LINE OA alert service sends active official TMD weather warnings whose stated affected area includes Samut Prakan, Bangkok and perimeter, or the East. With a registered TMD NWP access token, it also checks hourly 2 km-grid forecasts in Samut Prakan and sends only the provider's severe condition codes for heavy rain, thunderstorms, cold, and very hot weather. Subscribers explicitly consent and share a location; the system stores rounded coordinates, does not track in the background, deduplicates alerts, and supports opt-out.
- The currently verified public CCTV feeds near Samut Prakan are two iTIC Motion HLS cameras on Bang Na–Trat (BMAI0208 and BMAI0209), listed through Longdo Traffic. The former Highway Department km 6 feeds return HTTP 502. BMAI0202 currently resolves in iTIC's public directory to Pattaya–Naklua, Chonburi, and its HLS feed is unavailable; unverified or mislocated CCTV feeds are excluded from the Samut Prakan list.
- Initial illustrative flood reports must be identified as sample/demo content until replaced with live reports.

## Brand Commitments

Thai-language experience with blue as the primary visual theme; modern, clear, and easy to use on mobile.

## Evidence on Hand

Emergency contact names and numbers are supplied in the original product brief. Hourly precipitation forecasts are available from Open-Meteo as an optional map layer, and ThaiWater's public API provides water-level station observations and locations. Two public iTIC Motion HLS feeds on Bang Na–Trat are listed through Longdo Traffic; the Samut Prakan provincial CCTV page provides policy documents rather than public live streams. No production incident feed or Supabase project credentials were provided, and the initial map reports are still sample content.

## Product Principles

- Make recent local conditions easy to understand at a glance.
- Keep reporting short enough to complete on a mobile device.
- Show when information was reported and how its state changes over time.
- Treat unverified feeds and sample reports transparently.
- Keep emergency contact details easy to find.
