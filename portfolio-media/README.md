# Portfolio Media Kit

Ready-to-use marketing assets for social profiles, portfolio sites, and decks.

## Stills

| File | Size | Best for |
|---|---|---|
| `hero-1920x1080.png` | 1920×1080 | Portfolio hero / case-study cover / blog header |
| `square-1080x1080.png` | 1080×1080 | Instagram tile / portfolio thumbnail / Reddit |
| `linkedin-1584x396.png` | 1584×396 | LinkedIn profile banner |
| `twitter-1500x500.png` | 1500×500 | Twitter / X profile header |
| `stats-1200x630.png` | 1200×630 | OG image / Slack-share / quick recap |
| `architecture-2400x1350.png` | 2400×1350 | Slide deck architecture diagram (4K-ready) |

## Motion

| File | Size | Best for |
|---|---|---|
| `demo-pipeline-1100x620.mp4` | ~210 KB | Embedded demo on portfolio sites that allow video |
| `dashboard-tour-1280x800.mp4` | ~1 MB | Walkthrough of every dashboard page (overview → campaigns → queue → approvals → runs) |

The terminal pipeline GIF source is at `docs/screenshots/demo.gif`.

## Documents

| File | Size | Best for |
|---|---|---|
| `case-study.pdf` | 3 pages | Recruiter / client send-out · printable · case-study format with architecture, pipeline, engineering highlights, stack, quickstart |

## Sources

`_src/` holds the editable SVG / HTML sources. To re-render after edits:

```bash
node scripts/render-portfolio-media.mjs   # PNGs
node scripts/render-case-study.mjs        # PDF
node scripts/record-dashboard-tour.mjs    # MP4 (requires running stack)
```
