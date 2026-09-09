/**
 * Official-contact discovery for Benson Kansas City Contact Intelligence.
 *
 * Owns reusable search order, freshness windows, evidence-record creation, and
 * review-queue admission. Pure policy modules — no network I/O, no pitch sends.
 *
 * Send safety remains in `partnership-contracts/contact-evidence`. Discovery
 * maps into that contract and never widens emailable states.
 */

export * from './search-order.js';
export * from './states.js';
export * from './freshness.js';
export * from './purpose-blocklist.js';
export * from './email-inference.js';
export * from './evidence.js';
export * from './review-queue.js';
