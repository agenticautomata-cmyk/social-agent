# Listing-derived event category authority (2026-08-13)

## Problem

OSC listing event “The Reunion Hosted By DJ DOT WAV” was labeled Cooking. Venue/sibling cookbook-club signals were overriding per-event semantics.

## Fix

`resolveListingEventCategory` for listing-derived events only (Ask Benson listing persist + non-discount listing scrape).

Authority: title → description → explicit source type (when it matches this event) → tags → cooking-school venue fallback → Event.

DJ/live-music titles win over Cooking / Food & Drink listing labels. Cooking requires cooking-class / chef-demo / cookbook-club evidence on that event.
