import { describe, expect, it } from 'vitest';
import { getBuildIdentity } from './build-identity.js';

describe('build-identity', () => {
  it('returns sanitized identity fields', () => {
    const id = getBuildIdentity('benson-api');
    expect(id.serviceName).toBe('benson-api');
    expect(id.processStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(id.environment).toBeTruthy();
  });
});
