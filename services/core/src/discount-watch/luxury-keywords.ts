/** Signals a estate/liquidation sale may contain luxury resale treasure. */
export const LUXURY_ESTATE_RE =
  /\b(designer|louis vuitton|lv\b|chanel|gucci|prada|hermes|rolex|omega|cartier|tiffany|jewelry|jewellery|fine art|antique|mid[- ]century|sterling silver|collectible|provenance|estate jewelry|luxury|high[- ]end|vintage designer|fur coat|oriental rug|art deco)\b/i;

export const DISCOUNT_SIGNAL_RE =
  /\b(\d{1,2}%\s*off|\$\d+|\boff\b|sale|discount|promo|promotion|package|special offer|limited time|BOGO|clearance|markdown|deal|staycation|getaway|from \$\d+)\b/i;

export function isLuxuryEstateFind(title: string, body: string): boolean {
  const text = `${title} ${body}`;
  return LUXURY_ESTATE_RE.test(text);
}

export function hasDiscountSignal(title: string, body: string): boolean {
  const text = `${title} ${body}`;
  return DISCOUNT_SIGNAL_RE.test(text);
}
