# Benson Visual Generation Pipeline Audit — 2026-09-06

**Branch:** `release/scout-expansion-2026-07-25`  
**Mode:** Read-only evidence gathering. No code, database, config, credential, asset, media-kit, prompt, or production changes. No image-generation API calls. No Telegram, email, deploy, commit, or push.  
**Public:** https://benson.kckellie.com  
**API:** https://api.kckellie.com  

**Visual references used**

- Elliott’s written Weekend Drop target: bold Kansas City photography; navy / yellow / teal; recurring “Weekend Drop” identity; high-impact cover; daily information slides; readable event details; “Every Thursday, I’m putting you on”; city-specific content rather than generic decoration.
- Current Hotel media-kit capture in-repo: `docs/ops/screenshots/asset-closeout-review-2026-09-04-hotel-web-v9.png` — Kellie portrait, caption **“other”**, generic 2×2 metric cards, maroon/cream template.
- Weekend Drop screenshots described by Elliott were **not attached** to the audit request and were **not found** in the repository. Style notes below use the written brief plus the Hotel kit screenshot.

---

## Executive summary

ChatGPT is not beating Benson at the same job. **Benson does not generate Weekend Drop carousels or designed media-kit graphics.**

Benson’s OpenAI usage is a **research and copy stack** (chat, vision/OCR, web search, whisper, embeddings). ChatGPT’s Weekend Drop is a **design stack** (image generation, visual references, multi-slide continuity, human iteration). Comparing the two as if they were the same OpenAI workflow is a category error.

| Product | What Benson actually does | What a person sees |
|---|---|---|
| Media kits | Deterministic HTML/CSS + hand-rolled one-page PDF from live TikTok numbers and assigned photos | A credibility document: portrait, metric cards, bio, post examples |
| Weekend / This Weekend | Curated event list + **plain-text flyer brief** | A copyable brief. The UI says paste it into ChatGPT |
| Hospitality pitches | OpenAI `gpt-4o-mini` writes **email/form copy**; kit URL is attached | Text + a link to the HTML/PDF kit |
| Image generation | **Zero** OpenAI Images API calls anywhere in the repo | No designed flyer, no carousel, no generated cover art |

The Hotel kit looks generic because it is a **fixed credibility template**: system fonts, maroon accent `#7c3f2e`, 2×2 metric cards, and the caption under Kellie’s portrait is her **internal asset role** (`other`), not art direction. Navy/yellow/teal and “Weekend Drop” do not exist in Benson.

**Recommendation:** do **not** start by swapping in Nano Banana 2. There is no current OpenAI image implementation to “improve.” Build a **hybrid**: Benson owns facts, layout, brand tokens, and approval; an image provider (OpenAI `gpt-image-2` first, Gemini `gemini-3.1-flash-image` / Nano Banana 2 optional) only paints backgrounds or cover art. Keep event names, dates, venues, prices, and kit metrics as editable HTML/SVG. Do not flatten a media kit into one uneditable generated image.

---

## Current media-kit pipeline

```
Trigger
  • scripts/build-media-kits.ts
  • persistVersionedMediaKit() after asset assign / operator rebuild
  • hospitality pitch attach (stores URL + version id + hash)
        │
        ▼
buildMediaKitContent()                  [NO LLM]
  • resolvePitchAudienceEvidence()      live TikTok
  • VARIANT_HEADLINES / BIO / SERVICES  hardcoded copy
  • examplesForVariant()                caption-regex + view rank
  • assigned approved creator_assets
        │
        ▼
persistVersionedMediaKit()
  • mediaKitContentHash()               reuse version if unchanged
  • mint media_kit_versions row
        │
        ├─► renderMediaKitHtml()        fixed CSS template
        └─► renderMediaKitPdf()         PDF 1.4 + optional JPEG XObjects
                │
                ▼
uploads/media-kit-pdfs/{slug}-vN.pdf
        │
        ▼
GET /api/public/media-kit/:slug/view|pdf
dashboard /media-kit/:slug              proxies HTML
pitch stores mediaKitWebUrl + version
```

**An image-generation model does not participate.** OpenAI is not called during kit build, render, PDF, versioning, or public serve.

### Path details

| Step | Exact location | What happens |
|---|---|---|
| Content assembly | `services/core/src/media-kit/build.ts` — `buildMediaKitContent`, `examplesForVariant` | Live TikTok via `resolvePitchAudienceEvidence`; hardcoded headlines/bio/services; caption-regex examples; assigned assets |
| Audience evidence | `services/core/src/hospitality-pitch/creator-evidence.ts` | Connector numbers only; missing/stale figures are omitted, never invented |
| Version + PDF write | `services/core/src/media-kit/versions.ts` — `persistVersionedMediaKit` | Immutable versions; content hash; `?v=` pins |
| Content hash | `services/core/src/media-kit/content-hash.ts` | Unchanged content reuses the current version |
| HTML | `services/core/src/media-kit/render.ts` — `renderMediaKitHtml` | Standalone document; no app shell; no client JS |
| PDF | `services/core/src/media-kit/pdf.ts` — `renderMediaKitPdf` | Hand-rolled PDF 1.4, Helvetica, optional JPEG XObjects. **Not** Playwright HTML→PDF |
| Public API | `services/api/src/routes/public-media-kit.ts` | `/view` and `/pdf` |
| Dashboard proxy | `dashboard/app/media-kit/[slug]/route.ts` | Proxies HTML |
| Preview script | `services/core/src/scripts/render-media-kit-preview.ts` | Writes HTML to disk for local inspection |
| Manual rebuild | `services/core/src/scripts/build-media-kits.ts` | Operator rebuild |
| Pitch attach | `services/core/src/hospitality-pitch/pipeline.ts`, `loews-form-packet.ts` | Links `mediaKitWebUrl(mediaKitSlug(variant))` |
| Pitch **copy** (separate) | `services/core/src/hospitality-pitch/write.ts` | OpenAI `gpt-4o-mini`, temperature `0.4`, JSON — **text only** |

### Image-selection behavior

Featured photo (`render.ts` ~105–108): first assigned asset with `placement === 'headshot'` **or** `role === 'headshot'`; otherwise first asset with a `publicUrl`.

Figcaption (`render.ts` ~128–131): **raw `featured.role`**. If Kellie’s approved Hotel portrait is role `other`, the page prints **“other”**. That is a pipeline decision, not a renderer crash.

Gallery photos also caption with raw `role`.

Hotel examples (`build.ts` `examplesForVariant`): prefer captions matching `hotel|stay|staycation|suite|resort|rooftop|lobby|check-in|overnight`. If fewer than two matches, **fall back to top views** and disclose that shopping/thrift is where the audience is largest. That is why a hotel kit can show thrift posts.

### Versioning

- New content hash → new `media_kit_versions` row and new PDF filename.
- Unchanged hash → reuse current version.
- Public URLs can pin `?v=`.
- Pitch approval pins version id + content hash so regeneration cannot silently change what a recipient already approved.

### Error / fallback

- `buildMediaKitContent` returns `{ ok: false, missing }` if followers are missing/stale or there are no posts with metrics. **Refuses to invent numbers.**
- PDF image load skips non-JPEG or missing files; text still renders.
- Unverified partnerships are omitted rather than padded (`render.ts` ~124–126).

### Renderer / libraries

- HTML: inline CSS in `render.ts`. Tokens: ink `#16161a`, accent `#7c3f2e`, background `#fbfaf8`, system font stack (`-apple-system, Segoe UI, Roboto, Helvetica, Arial`).
- PDF: no Puppeteer, Playwright, pdfkit, or puppeteer-core in this path. Custom PDF 1.4 writer.
- **No SVG/canvas flyer.** **No HTML screenshot of a designed slide.**

---

## Current Weekend / “This Weekend” pipeline

```
Discover / Things To Do / Watchlist / Gmail / calendar
        │
        ▼
Weekend list (selected items)           event discovery — NOT graphics
        │
        ▼
GET /api/calendar/weekend-list
  loadWeekendList()
  formatFlyerBrief()                    PLAIN TEXT
  formatFullList()                      PLAIN TEXT (operator)
        │
        ▼
dashboard weekend-list-panel
  “Copy flyer brief”
  toast: “Paste it into ChatGPT for this week’s graphics.”
  copy: “Benson does not generate the flyer.”
        │
        ▼
Human pastes into ChatGPT               ← Weekend Drop look is born here
```

**Confirmed:** Benson generates **only text** for weekend graphics. It does not screenshot HTML, draw SVG/canvas, call an OpenAI image endpoint, use a stored carousel template, or run an unfinished weekend image worker.

| Capability | Exists? | Where |
|---|---|---|
| Weekend recommendations / shortlist | Yes | `services/core/src/creator-calendar/weekend-things-to-do.ts` |
| Selected weekend list | Yes | `services/core/src/creator-calendar/weekend-list.ts` — `loadWeekendList` |
| Flyer brief (copy) | Yes | `formatFlyerBrief` — title `THINGS TO DO THIS WEEKEND IN KC` plus day blocks |
| Full operator list | Yes | `formatFullList` |
| UI + ChatGPT handoff | Yes | `dashboard/app/weekend-list/weekend-list-panel.tsx` L89–93, L144–146 |
| Voice-read weekend list | Yes (text/audio of the list) | weekend list voice path — not a graphic |
| Carousel / flyer images | **No** | — |
| Social image worker | **No** | — |
| Content plans | Text only | planner / `generate_content_plan` interest action |
| Downloadable social assets | **No** for Weekend Drop | media-kit PDF is a credibility page, not a carousel |
| Watchlist “carousel” | OCR of **other people’s** IG slides | `services/core/src/curator-watchlist/slide-ocr.ts` — vision **in**, not design **out** |

Do not confuse **event discovery** (Watchlist, Discover, Eventbrite, Gmail) with **graphic generation**. Discovery can feed the weekend list. It never paints slides.

---

## Why the Hotel kit looks like that

From `render.ts` plus `docs/ops/screenshots/asset-closeout-review-2026-09-04-hotel-web-v9.png`:

| Observed | Pipeline decision |
|---|---|
| Large Kellie portrait | Featured = first public assigned asset when role is not `headshot` |
| Caption **“other”** | `<figcaption>${esc(featured.role)}</figcaption>` prints the internal enum |
| Generic 2×2 metric cards | Hard-coded `.stats` / `.stat` CSS: Followers, median views, total views, engagement % |
| Maroon / cream, system fonts | `--accent: #7c3f2e`; no navy/yellow/teal; no Weekend Drop type |
| Thrift / shopping examples on a hotel kit | `examplesForVariant('hotel')` caption-regex; &lt;2 hotel-topic posts → top views + honest note |
| One long page, not cover + daily slides | Single `<main>` template; no slide system |
| No KC photography / “Weekend Drop” identity | Never in the template |
| Honest numbers | Intentional: kits exist to quote live analytics, not to win attention on Instagram |

Role remaining `other` is a Creator Assets fact (upload default). The renderer **prints the raw enum**. That is the specific decision producing the “other” label.

---

## OpenAI model / endpoint inventory

**SDK:** `openai` `^4.77.0` (`services/core/package.json`).

**Credential and config variable names (values not read, never printed):**

| Variable | Role |
|---|---|
| `OPENAI_API_KEY` | Required for Ask Benson, pitches, OCR, search, whisper, embeddings |
| `GOOGLE_AI_API_KEY` | Imagen / Gemini; `createImageProvider()` falls back to picsum mock if missing or `DEMO_MODE` |
| `BENSON_ASK_MODEL` | Default `gpt-4o-mini` |
| `BENSON_ASK_DEEP_MODEL` | Default `gpt-4o` |
| `BENSON_ASK_DEEP_MODEL_ENABLED` | Default **false** |
| `BENSON_WEB_SEARCH_MODEL` | Default `gpt-4o-mini` |
| `INTAKE_WHISPER_MODEL` | Default `whisper-1` |
| `BENSON_LLM_DAILY_BUDGET_USD` | Default `3` — text/search budget, not image gen |
| `DEMO_MODE` | Mocks LLM / image / whisper when set |
| `HEYGEN_API_KEY` | Unrelated video; not used for kits or Weekend Drop |

Repo-wide search for `images.generate`, `gpt-image`, `dall-e`, `dalle`, `images.edit`: **zero matches**.

| Model / endpoint | Feature | Kind |
|---|---|---|
| `gpt-4o-mini` Chat Completions | Ask Benson, hospitality pitches (`write.ts` temp 0.4), scoring, discovery, watchlist, pulse, captions, intake extract, partnerships, strategist, outreach drafting | Text; some vision-in |
| `gpt-4o` | Ask deep model — **off** unless `BENSON_ASK_DEEP_MODEL_ENABLED` | Text |
| `gpt-4o-mini` Responses + `web_search_preview` | `services/core/src/web-research/index.ts` | Search text |
| `whisper-1` | `services/core/src/intake/transcribe.ts` | Audio |
| `text-embedding-3-small` | `services/core/src/providers/llm.ts` | Embeddings |
| Vision chat (`gpt-4o-mini` + image parts) | `ask-benson/collect-from-image.ts`, `curator-watchlist/slide-ocr.ts`, newsletter/scout OCR, draft visual-analysis | **Read** images; do not generate |
| `imagen-3.0-generate-001` REST | `services/core/src/providers/image.ts` — **persona-picker worker only** (synthetic industry faces). Mock picsum if no Google key / `DEMO_MODE` | Image gen, **not Kellie kits or Weekend Drop** |
| OpenAI Images API / `gpt-image-*` | **None** | — |

**Reference images / editing:** vision can *read* uploads (OCR, listing extract). No image-edit API. No resolution, aspect-ratio, or quality controls for generated kit/carousel art, because that art is never generated.

**Calls per kit or Weekend Drop carousel:** **0** image-generation calls. Kit = DB + template. Weekend flyer = string concat in `formatFlyerBrief`.

**Retry / moderation:** `openai-retry.ts` exists for some chat paths. Images moderation / size / quality params are unused.

**Telemetry:** `services/core/src/llm-spend/` + `pnpm audit:openai-spend` (`services/core/src/scripts/audit-openai-spend.ts`). Tracks discovery/scoring/digest/web-search/Ask. No image-token line items.

**Legacy image path (do not confuse with Kellie):** `persona-picker` worker (`services/workers/src/workflows/persona-picker.ts`) calls `createImageProvider().generatePortrait()` for **campaign persona portraits** (dental-owner style), not KCKellie.

---

## Evidence table

| Claim | File / function | Evidence |
|---|---|---|
| Kits are not LLM-designed | `media-kit/build.ts`, `render.ts`, `pdf.ts`, `versions.ts` | No OpenAI import or generate call |
| Kit HTML is a fixed template | `render.ts` L155–231 | Hard-coded CSS tokens and layout |
| Featured caption is raw role | `render.ts` L128–131 | `esc(featured.role)` |
| Featured pick ignores “other” as a label | `render.ts` L105–108 | Only `headshot` placement/role is preferred |
| PDF is not HTML-print | `pdf.ts` header | “Hand-rolled PDF 1.4 with Helvetica” |
| Hotel examples can be thrift | `build.ts` L184–213 | Fallback note names shopping/thrift |
| Kit refuses invented stats | `build.ts` L242–247, L253+ | `{ ok: false, missing }` |
| Pitch copy uses OpenAI | `hospitality-pitch/write.ts` L56–65 | `gpt-4o-mini`, temperature 0.4 |
| Weekend flyer is text | `weekend-list.ts` `formatFlyerBrief` L449–459 | Title + day blocks, no markup |
| Product offloads graphics to ChatGPT | `weekend-list-panel.tsx` L89–93, L144–146 | Explicit copy |
| No OpenAI Images usage | repo grep | Zero `images.generate` / `gpt-image` / DALL·E |
| Only unused image gen is Imagen/mock | `providers/image.ts`, `persona-picker.ts` | Portraits for personas |
| Image provider mocks without Google key | `createImageProvider` L74–76 | `DEMO_MODE` or missing `GOOGLE_AI_API_KEY` → picsum |
| Daily LLM budget is text | `env.ts` `BENSON_LLM_DAILY_BUDGET_USD` default `3` | No image-gen line |
| Deep model off by default | `env.ts` `BENSON_ASK_DEEP_MODEL_ENABLED` default `false` | — |

---

## Quality-gap causes

### Confirmed (code evidence)

1. **No image-generation call** on media kits or Weekend Drop.
2. **Product explicitly offloads graphics to ChatGPT** (`weekend-list-panel.tsx`).
3. **Generic template forces generic output** — one HTML theme, Helvetica PDF.
4. **Layout has no design variation** — no navy/yellow/teal tokens, no cover slide, no daily slides.
5. **The model is asked for text (pitches), not design.**
6. **Event imagery is unused** in kits/flyers (inventory photos never become slides).
7. **Internal role leaked** as the caption “other”.
8. **Hotel examples often shopping/thrift** by documented fallback, which weakens hotel selling power even when numbers are honest.
9. **Benson never receives Weekend Drop visual references** — there is no image prompt and no reference-image argument in this path.
10. **Kellie brand identity for graphics is absent** — no “Weekend Drop” system, no “Every Thursday, I’m putting you on,” no brand memory for slides.

### Not the cause (confirmed)

- Generated output discarded after generation — generation never runs.
- Cost limits forcing low image quality — no image quality settings exist.
- Wrong or unsupported OpenAI image endpoint — unused.
- Media kits and weekend graphics sharing the wrong template — weekend has **no graphic template**.
- Fallback image mode always used for kits — there is no kit image mode.
- Production configuration differs from development on image models — there is no image-model config for this product.

### Inference (labeled)

- ChatGPT carousels look better because a human iterated with a visual model, city photography, a recurring identity, and slide-by-slide art direction. Benson never entered that loop.
- The OpenAI API is capable of approaching that result **if Benson called an image model and assembled slides**. The current implementation does not do that. This is not evidence that the API is incapable.

---

## What ChatGPT likely did differently

*Informed inference. This section does not claim access to ChatGPT’s private workflow. It is based on the described Weekend Drop output and the Hotel kit screenshot.*

| Capability | Why the Weekend Drop looks that way | What Benson has today |
|---|---|---|
| Image generation / editing | Bold KC photography + designed type on image | None in this path |
| Kansas City imagery | Specific city look, not stock decoration | Text “Kansas City” in headlines only |
| Visual references | Recurring navy/yellow/teal + “Weekend Drop” cover | None passed to any model |
| Multi-slide continuity | Cover vs Friday / Saturday / Sunday info slides | One long HTML page (kits); one text brief (weekend) |
| Typography and layout system | Hierarchy readable at phone size | System fonts + Helvetica |
| Editable factual text | Event names/times must stay correct | Facts exist in `flyerBrief`; ChatGPT may bake them into pixels |
| Art-direction iteration | Conversational revisions | One-shot kit persist; no design loop |
| Brand memory | “Every Thursday, I’m putting you on” | Not stored as a graphic system |
| Human approval | Kellie already curates the list | Approval exists for kits/assets/sends; not for generated slides |
| Useful city content | Daily event facts, not ornaments | Benson already has this as **text** |

Functionally, Benson would need a **design system + optional image art layer + approval**, not a better `gpt-4o-mini` pitch prompt.

---

## Provider comparison (no implementation)

Official docs checked **2026-09-06**:

- OpenAI Image generation: https://developers.openai.com/api/docs/guides/image-generation — current model **`gpt-image-2`** via `v1/images/generations` and `v1/images/edits`; also Responses `image_generation` tool. Reference images and edits supported. Organization verification may be required. Text rendered inside images is still imperfect; latency can be high.
- Gemini Nano Banana 2: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image — model id **`gemini-3.1-flash-image`**. Product blog: https://blog.google/innovation-and-ai/technology/developers-tools/build-with-nano-banana-2/

Repo today: `ImagenProvider` still hard-codes **`imagen-3.0-generate-001`**. That is stale versus Nano Banana 2 and is unused for Kellie kits.

Kellie’s photos were **not** uploaded to any external provider during this audit.

| Criterion | A Improve current OpenAI text | B Add OpenAI Images (`gpt-image-2`) | C Add Gemini / Nano Banana 2 only | D AI art + deterministic HTML/SVG text | E Hybrid provider interface |
|---|---|---|---|---|---|
| Expected design quality | No change (no art) | Strong covers if prompted well | Strong covers if prompted well | Best: brand system + optional art | Same as D + failover |
| Reference-image support | N/A | Yes (edits / references) | Yes | Yes on art layer only | Yes |
| Subject / likeness consistency | Keep real photos | Risk if full-page gen of Kellie | Risk | **Best** — never regenerate face | Best |
| Text accuracy | High (already) | Weak if baked into PNG | Weak if baked in | **Highest** | Highest |
| Multi-slide consistency | None | Possible, costly, drift-prone | Possible, drift-prone | Template continuity | Same |
| Editable text | High | Low if flattened | Low | **High** | High |
| Cost-control feasibility | $0 extra | Per image; extend `llm-spend` | Needs `GOOGLE_AI_API_KEY` + cap | Cap art calls only | Cap + provider switch |
| Latency | Instant kit | Seconds–minutes | Flash-class, still network | Template instant; art optional | Same |
| Implementation effort here | Tiny (role caption, CSS) | Medium new module | Medium + new creds + stale Imagen replace | Medium (design system) | Medium+ |
| Reliability | Already shipping | New failure mode (moderation, org verify) | New failure mode + unused Imagen code | Template always works | Fail over to template |
| Privacy for Kellie’s assets | Current approval path | Must not upload private originals without approval | Same | Same | Same |
| Suitability for media kits | Already the right *job* (truthful doc) | Do not flatten whole kit | Do not flatten | **Best** | Best |
| Suitability for Weekend Drop | Still ChatGPT | Can paint covers | Can paint covers | **Best match** | Best |

**A cannot close the visual gap.** There is no visual OpenAI implementation to improve.

**C alone is the wrong first move.** Benson’s gap is assembly + brand system, not “Google vs OpenAI.” Adding Nano Banana 2 without a layout system will produce prettier pictures that still lie, leak “other,” or cannot be edited.

**B without D** risks baking event names and prices into pixels.

**Recommended:** **D now, E next.** OpenAI `gpt-image-2` first (key already in the OpenAI stack), Gemini `gemini-3.1-flash-image` optional behind the same interface.

---

## Recommended architecture

**Phase 1 — deterministic design system (option D, no billable images required)**

- Brand tokens: navy / yellow / teal; “Weekend Drop” cover; daily info slides.
- Weekend slides assembled from `formatFlyerBrief` / selected list facts.
- Media-kit CSS: map roles to human labels (hide raw `other`); optional featured-as-headshot; hotel examples only when evidenced.
- Facts stay Benson-owned and editable.

**Phase 2 — provider-agnostic art layer (option E)**

- Thin `ImageArtProvider`: OpenAI `gpt-image-2` first; Gemini `gemini-3.1-flash-image` optional.
- Art = backgrounds / covers only. Portrait = approved `creator_assets` (e.g. `b5831e43-2012-4bbb-953f-8fcfa01a8076` / `37436.jpg`) — never regenerated without Kellie approval.
- Preview + explicit public-use approval.
- Log provider, model, prompt version, source assets, cost, timestamp.
- Kill switch + daily $ cap (`BENSON_IMAGE_GEN_ENABLED`, `BENSON_IMAGE_GEN_DAILY_CAP_USD`).
- Keep send-safety, quarantine, asset versioning, and `assertApprovedForSend` intact.

---

## Controlled proof-of-concept (design only — do not run)

Fair comparison using **identical inputs**. Do not generate billable images until Elliott approves a later implementation pass.

### Outputs

1. Hotel partnership media-kit cover / page
2. Weekend Drop cover
3. One daily event-list slide

### Fixed inputs (all arms)

- Approved KCKellie portrait `b5831e43-2012-4bbb-953f-8fcfa01a8076` / `37436.jpg` — do not upload to a provider without Kellie approval
- Weekend Drop screenshots as **style references only** (when Elliott supplies them)
- A locked fact sheet from a real `formatFlyerBrief` (event names, dates, venues, prices) plus hotel kit headline/bio/metrics snapshot
- Same brand tokens if the template arm is used

### Arms

| Arm | Provider / model | AI-generated | Deterministic |
|---|---|---|---|
| 1 Control | Current Benson HTML/PDF | None | Entire kit |
| 2 Template only | HTML/SVG, no AI art | None | Cover + daily slide + kit page |
| 3 OpenAI art | `gpt-image-2` background only | Cover/background pixels | All factual text overlay |
| 4 Gemini art | `gemini-3.1-flash-image` background only | Cover/background pixels | All factual text overlay |

**Never** treat event text baked into a PNG as the source of truth.

### Sizes

- Cover and daily slide: 1080×1350 (4:5, phone)
- Kit page: letter / ~390px-wide web (current kit is phone-first already)

### Limits

- Maximum **2** attempts per design arm
- Hard spend cap (example: **$2** total) via existing `llm-spend` plus a new image-gen counter
- No live send, no Telegram, no pitch attach
- Delete generated art after scoring unless Kellie approves keep
- Do not upload private unpublished originals

### Approval

- Operator preview required
- Kellie approval required before any public or pitch use
- Record provider, model, prompt version, source asset ids, cost, timestamp

### Scoring rubric (1–5 each)

| Score | Meaning |
|---|---|
| Attention at phone size | Stops the thumb in 1080×1350 |
| KCKellie identity | Looks like her, not a generic influencer template |
| Kansas City specificity | City photography / local facts, not stock ornaments |
| Typography | Hierarchy; readable event details |
| Factual accuracy | Names, dates, venues, prices, metrics match the locked sheet |
| Likeness preservation | Approved portrait, no invented face |
| Multi-slide consistency | Cover and daily slide share a system |
| Editability | Can change Friday’s venue without regenerating the week |
| Media-kit selling power | Hotel marketer would take it seriously |
| Reproducibility | Same inputs → same structure next Thursday |

---

## Architecture guardrails

Any future implementation must:

- Preserve Kellie’s likeness and approved-asset permissions
- Never fabricate a partnership, hotel visit, testimonial, or performance claim
- Keep event names, dates, venues, and prices deterministic / editable
- Clearly distinguish generated illustrations from real venue photography
- Require preview and explicit approval before public use
- Record provider, model, prompt version, source assets, cost, and generation timestamp
- Support spending limits and kill switches
- Avoid flattening an entire media kit into an uneditable generated image
- Keep current working asset, queue, and send-safety protections intact (`assertApprovedForSend`, quarantine, version pins)

---

## Expected credentials / configuration (names only)

Already referenced:

- `OPENAI_API_KEY`
- `GOOGLE_AI_API_KEY` (optional; unused for kits today)
- `BENSON_LLM_DAILY_BUDGET_USD`
- `DEMO_MODE`

If Elliott later approves image art:

- `BENSON_IMAGE_GEN_ENABLED` (kill switch, default false)
- `BENSON_IMAGE_GEN_PROVIDER` (`openai` | `gemini` | `off`)
- `BENSON_IMAGE_GEN_MODEL` (e.g. `gpt-image-2` or `gemini-3.1-flash-image`)
- `BENSON_IMAGE_GEN_DAILY_CAP_USD`
- Existing `OPENAI_API_KEY` for OpenAI Images
- Optional `GOOGLE_AI_API_KEY` for Gemini

Never commit values. Never print secrets.

---

## Cost-control approach

- Keep `BENSON_LLM_DAILY_BUDGET_USD` for text/search.
- Add a **separate** image-gen daily cap; image calls are more expensive and easier to runaway-loop.
- Count attempts (max 2 per design in PoC).
- Skip image gen entirely when the kill switch is off — template still ships.
- Record cost on each generation row so `pnpm audit:openai-spend` (or a sibling audit) can show image vs text.
- Fail closed: if the cap is hit, serve the deterministic template, do not silently call another provider.

---

## Risks and privacy

- Uploading Kellie’s unpublished photos to OpenAI or Google creates a third-party processing event. Do not do that without her approval and a recorded source-asset id.
- Full-page image generation can invent a face that is “almost Kellie.” Use the approved portrait as a real photo overlay.
- Baking prices and times into pixels will ship stale or wrong flyers.
- Flattening a media kit into one generated image destroys the current honesty guarantee (live analytics, no invented partnerships).
- Persona-picker Imagen/picsum must stay isolated from Kellie kits so a mock face never appears as her.

---

## Clear recommendation

**Build a provider-agnostic hybrid (D then E). Do not “improve the current OpenAI implementation” as the visual fix. Do not add Nano Banana 2 first.**

Why:

1. The current OpenAI path does not generate images. Prompt work on `gpt-4o-mini` cannot produce Weekend Drop slides.
2. Nano Banana 2 / `gpt-image-2` can paint, but without a Benson layout system the facts, likeness, and editability problems remain.
3. OpenAI is already credentialed for text; `gpt-image-2` is the lowest-friction art provider **after** the template exists.
4. Gemini should be an optional second provider behind the same interface, not a rewrite of media kits.

---

## Exact next implementation scope (if Elliott approves)

Isolated, no production kit mutation, no Telegram, no Kellie photo upload until she approves:

1. Brand tokens + Weekend Drop HTML/SVG slides from the existing flyer brief / selected list.
2. Media-kit CSS: human-readable role labels; do not print raw `other`; hotel examples only when evidenced.
3. Thin `ImageArtProvider` (OpenAI `gpt-image-2` first) for **cover backgrounds only**.
4. Approval + spend log + kill switch + daily cap.
5. Run the four-arm PoC above under the $2 cap.

Out of scope until that lands: replacing kits with generated posters; wiring Gemini as the only path; sending slides; changing Kellie’s existing Hotel assignment or role.

---

## Honest unknowns and blockers

- Weekend Drop screenshots were not in the audit chat and not in the repo; style comparison used Elliott’s written brief plus the Hotel kit PNG.
- Live presence of `GOOGLE_AI_API_KEY` and OpenAI org verification for `gpt-image-2` were **not** re-checked in this pass (no secret reads).
- Whether Kellie wants Benson to *own* Thursday graphics vs keep ChatGPT as the painter is a product decision, not a code fact.
- Current list prices and rate limits for `gpt-image-2` and `gemini-3.1-flash-image` should be re-read from the official pages on the day of any PoC; figures above are architecture facts, not a quote sheet.
- ChatGPT’s exact internal model and reference-image workflow for the supplied carousels is unknown.

---

## Bottom line

Benson’s OpenAI workflow produces generic media kits because **it is not a visual-generation workflow**. It is a truthful document assembler that hands flyer design to ChatGPT on purpose. Close that gap with a Benson-owned layout system and an optional, capped, approvable art provider — not by assuming the API is weak, and not by dropping Nano Banana 2 onto the current template.
