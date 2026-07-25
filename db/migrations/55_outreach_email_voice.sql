-- Humanize default sponsor outreach templates (remove "Hi there" / form-letter intros).

UPDATE email_templates SET
  subject = 'KC creator collab — {{business_name}}',
  body = E'{{business_name}} caught my eye for a KC lifestyle feature — {{benson_recommendation}}\n\nI film local dining, shopping, and events for Kansas City viewers on TikTok. Open to a quick chat about a collab?\n\n— {{kellie_name}}',
  updated_at = NOW()
WHERE type = 'introduction';

UPDATE email_templates SET
  subject = 'Media kit — {{business_name}} × {{kellie_name}}',
  body = E'As promised — media kit for {{business_name}}:\n\n{{media_kit_name}}\n{{media_kit_url}}\n\n{{benson_recommendation}}\n\nHappy to talk through a {{category}} feature if it''s a fit.\n\n— {{kellie_name}}',
  updated_at = NOW()
WHERE type = 'media_kit_send';

UPDATE email_templates SET
  subject = 'Following up — {{business_name}}',
  body = E'Circling back on my note about {{business_name}} — {{benson_recommendation}}\n\nStill interested if partnerships are on your radar this month.\n\n— {{kellie_name}}',
  updated_at = NOW()
WHERE type = 'follow_up';

UPDATE email_templates SET
  subject = 'World Cup traffic in KC — {{business_name}}',
  body = E'With World Cup fans hitting KC, {{business_name}} feels like a natural fit for visitor-facing content — {{benson_recommendation}}\n\nI''d love to pitch a soccer-week angle for your {{category}} brand.\n\n— {{kellie_name}}',
  updated_at = NOW()
WHERE type = 'world_cup';

UPDATE email_templates SET
  subject = 'Date night in KC — {{business_name}}',
  body = E'I film date-night spots for KC couples — {{business_name}} looks like exactly what my viewers save for weekend plans.\n\n{{benson_recommendation}}\n\nOpen to a sponsored feature or hosted experience?\n\n— {{kellie_name}}',
  updated_at = NOW()
WHERE type = 'luxury_date_night';

UPDATE email_templates SET
  subject = 'Opening week — {{business_name}}',
  body = E'Congrats on {{business_name}} — I cover new KC restaurant openings for a local food audience.\n\n{{benson_recommendation}}\n\nWould opening-week coverage or a partnership make sense on your end?\n\n— {{kellie_name}}',
  updated_at = NOW()
WHERE type = 'restaurant_opening';

UPDATE email_templates SET
  subject = 'KC shopping feature — {{business_name}}',
  body = E'{{business_name}} is the kind of local find my shopping audience loves — {{benson_recommendation}}\n\nOpen to a retail feature or market-day collab?\n\n— {{kellie_name}}',
  updated_at = NOW()
WHERE type = 'shopping_retail';
