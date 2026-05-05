# HeyGen Setup

Two distinct avatar use cases, two setup tracks.

## 1. Founder avatar (your face, your voice)

Used for explainer / educational / founder-message / industry-insight content. Set up **once**, then reused for every founder-style video.

**Steps:**

1. Sign up at <https://app.heygen.com/>. **Creator** plan ($24/mo) supports custom avatars; **Team** plan ($69/mo) adds API access at higher concurrency. Confirm your tier supports **Avatar IV** + **Voice Cloning**.
2. **Train Avatar IV**:
   - Record ~2 min of footage: chest-up, neutral background, eye contact with camera, natural speech
   - Upload to HeyGen → "Custom Avatars" → "Create Avatar IV"
   - Training takes ~30–60 min
3. **Clone voice**:
   - Record/upload ~5 min of clean speech (no music, single speaker)
   - "Voice Cloning" → save with descriptive name
4. Save IDs to campaign config:
   ```sql
   UPDATE campaigns SET
     founder_heygen_avatar_id = 'avt_xxx',
     founder_heygen_voice_id  = 'vc_xxx'
   WHERE id = '<campaign-id>';
   ```

## 2. Persona avatars (testimonial/case-study characters)

Used for testimonial / case-study / success-story / transformation content where the on-screen face should be a *customer*, not the founder.

**Two strategies, choose based on budget + realism:**

### Strategy A — HeyGen Photo Avatar from generated portrait (cheapest, fast)

1. `persona_picker` worker generates a portrait via Imagen/Gemini matching `personas.portrait_prompt` (e.g. "professional headshot of a 45yo female dental practice owner, warm smile, soft studio lighting").
2. Upload portrait to HeyGen → "Photo Avatar". Returns `heygen_avatar_id`.
3. Use a HeyGen stock voice that matches the persona's age/region/gender, store as `heygen_voice_id`.
4. Save back to `personas` row. Persona now reusable.

Cost: minimal — Photo Avatars are included in HeyGen plan; just video render minutes.

### Strategy B — Full Avatar IV per persona (most realistic, expensive)

Only if testimonial fidelity matters enough to justify cost. Each Avatar IV costs training time + plan slot. Reserve for "hero" personas you'll use 20+ times.

## API basics

```
POST https://api.heygen.com/v2/video/generate
Headers: { X-Api-Key: $HEYGEN_API_KEY }
Body: {
  video_inputs: [{
    character: { type: 'avatar', avatar_id, avatar_style: 'normal' },
    voice:     { type: 'text', input_text, voice_id, speed: 1.0 },
    background:{ type: 'color', value: '#ffffff' }
  }],
  dimension: { width: 720, height: 1280 },
  aspect_ratio: '9:16'
}
→ { data: { video_id } }

GET  https://api.heygen.com/v1/video_status.get?video_id=...
→ { data: { status: 'completed' | 'processing' | 'failed', video_url } }
```

Renders typically take 30–120s for ~30s output. Polling worker uses 15s intervals.

## Cost discipline

At 28 videos/week × ~30s × 4 weeks = ~56 minutes/month of rendered video.

| HeyGen plan | Monthly minutes | Effective cost / 56 min |
|---|---|---|
| Creator ($24) | 15 min | needs upgrade |
| Team ($69) | 30 min | needs upgrade |
| Pro ($89/seat) | 90 min | $89/mo |
| Scale (custom) | 600+ | $300+/mo |

**Recommendation:** start on **Pro** ($89). Upgrade only when monthly usage exceeds plan minutes.

If volume grows, consider: shorter videos, reusing renders across platforms (one render → cropped for IG + TikTok), or substituting some persona content with text-on-video templates (no avatar needed).
