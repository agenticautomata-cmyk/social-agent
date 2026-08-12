# Ask Benson zero-content URL fetch — browser fallback (2026-08-12)

## Problem

After the URL integrity fix, `https://www.theosc.co/events` reported HTTP 200 / 0 usable chars / JS=no / browser=skipped even though the public page is browser-readable with structured upcoming events.

## Root cause

`detectAccessBlock` matched the substring `captcha` inside Squarespace CMS JSON (`captchaSettings`) and treated the page as access-blocked, returning before HTML extraction or browser render.

## Fix (scoped)

1. Tighten access-block detection to real challenge widgets / thin auth walls — not CMS config keys or nav Login links.
2. When HTTP succeeds but content is empty/thin or JS-shell, run existing Playwright browser render (concurrency=1, content wait, no arbitrary sleep) before declaring unreadable.
3. Do **not** restore automatic web-search as a page-content substitute.
4. Treat `/events` (and multi-event listing cues) as listing/source pages — skip page-named entity layer; extract individual events via existing intake.
5. Preserve URL integrity gates (no unrelated headline entities, no positive CTAs without supported items).

## Expected OSC behavior

- Usable content from HTTP and/or browser render
- Event candidates (titles, dates, View Event / RSVP links) — not “Los Angeles Welcomes Workers…”
- Safe `NO_SUPPORTED_ENTITY` only if browser also yields nothing usable
