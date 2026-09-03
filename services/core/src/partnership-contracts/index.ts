/**
 * Partnership contracts.
 *
 * The invariants every partnership surface must agree on: what counts as a verified
 * contact, what compensation actually is, whether a pitch may be sent, and what
 * belongs in Kellie's workflow at all.
 *
 * Every module here is pure. Persistence lives in the feature directories that
 * consume these contracts.
 */

export * from './business-key.js';
export * from './contact-evidence.js';
export * from './compensation.js';
export * from './send-readiness.js';
export * from './quarantine.js';
