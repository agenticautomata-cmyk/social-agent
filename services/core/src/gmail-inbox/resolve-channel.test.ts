import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveInboundChannelFromHeaders,
  isDiscoveryEmail,
  isSponsorOrBookingChannel,
  ROUTING_HEADER_NAMES,
} from './resolve-channel.js';

function headers(map: Record<string, string>) {
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

describe('resolveInboundChannelFromHeaders', () => {
  it('detects discoveries@ through Delivered-To', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({ 'Delivered-To': 'discoveries@kckellie.com' }),
    );
    assert.ok(resolution);
    assert.equal(resolution?.channelId, 'discoveries');
    assert.equal(resolution?.matchedHeader, 'Delivered-To');
  });

  it('detects discoveries@ through To header', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({ To: 'Discoveries <discoveries@kckellie.com>' }),
    );
    assert.equal(resolution?.channelId, 'discoveries');
  });

  it('detects discoveries@ through X-Original-To', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({ 'X-Original-To': 'discoveries@kckellie.com' }),
    );
    assert.equal(resolution?.channelId, 'discoveries');
  });

  it('detects discoveries@ through Envelope-To', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({ 'Envelope-To': 'discoveries@kckellie.com' }),
    );
    assert.equal(resolution?.channelId, 'discoveries');
  });

  it('detects discoveries@ through Original-Recipient', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({ 'Original-Recipient': 'rfc822;discoveries@kckellie.com' }),
    );
    assert.equal(resolution?.channelId, 'discoveries');
  });

  it('detects discoveries@ through Resent-To', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({ 'Resent-To': 'discoveries@kckellie.com' }),
    );
    assert.equal(resolution?.channelId, 'discoveries');
  });

  it('prefers original alias over Gmail forward target', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({
        To: 'kckelliecreator@gmail.com',
        'X-Original-To': 'discoveries@kckellie.com',
      }),
    );
    assert.equal(resolution?.channelId, 'discoveries');
    assert.equal(resolution?.matchedEmail, 'discoveries@kckellie.com');
  });

  it('routes contact@ separately from discoveries@', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({ To: 'contact@kckellie.com' }),
    );
    assert.equal(resolution?.channelId, 'contact');
    assert.equal(isDiscoveryEmail(resolution), false);
    assert.equal(isSponsorOrBookingChannel(resolution), true);
  });

  it('routes media@ and collabs@ separately', () => {
    assert.equal(
      resolveInboundChannelFromHeaders(headers({ To: 'media@kckellie.com' }))?.channelId,
      'media',
    );
    assert.equal(
      resolveInboundChannelFromHeaders(headers({ To: 'collabs@kckellie.com' }))?.channelId,
      'collabs',
    );
  });

  it('routes sponsors@ separately from discoveries@', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({ To: 'sponsors@kckellie.com' }),
    );
    assert.equal(resolution?.channelId, 'sponsors');
    assert.equal(isDiscoveryEmail(resolution), false);
    assert.equal(isSponsorOrBookingChannel(resolution), true);
  });

  it('routes booking@ separately', () => {
    const resolution = resolveInboundChannelFromHeaders(
      headers({ To: 'booking@kckellie.com' }),
    );
    assert.equal(resolution?.channelId, 'booking');
  });

  it('includes all supported routing header names', () => {
    assert.ok(ROUTING_HEADER_NAMES.includes('Delivered-To'));
    assert.ok(ROUTING_HEADER_NAMES.includes('X-Original-To'));
  });
});
