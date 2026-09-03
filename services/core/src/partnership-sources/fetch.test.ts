import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPathAllowed, parseRobotsTxt } from './fetch.js';

describe('robots.txt parsing', () => {
  it('reads the Visit KC rules including the crawl delay', () => {
    const rules = parseRobotsTxt(
      ['User-agent: *', 'Disallow: /wp-admin/', 'Crawl-delay: 5', ''].join('\n'),
    );
    assert.deepEqual(rules.disallow, ['/wp-admin/']);
    assert.equal(rules.crawlDelaySeconds, 5);
    assert.equal(isPathAllowed(rules, '/media-center/contact-us/'), true);
    assert.equal(isPathAllowed(rules, '/wp-admin/edit.php'), false);
  });

  it('reads the HLAKC news disallow', () => {
    const rules = parseRobotsTxt(['User-agent: *', 'Disallow: /news.html'].join('\n'));
    assert.equal(isPathAllowed(rules, '/news.html'), false);
    assert.equal(isPathAllowed(rules, '/'), true);
  });

  it('treats an empty robots.txt as no restrictions', () => {
    const rules = parseRobotsTxt('');
    assert.equal(isPathAllowed(rules, '/anything'), true);
    assert.equal(rules.unavailable, false);
  });

  it('ignores comments and blank lines', () => {
    const rules = parseRobotsTxt(
      ['# a comment', '', 'User-agent: *', 'Disallow: /private # trailing note', ''].join('\n'),
    );
    assert.deepEqual(rules.disallow, ['/private']);
  });

  it('groups consecutive user-agent lines together', () => {
    const rules = parseRobotsTxt(
      ['User-agent: Googlebot', 'User-agent: *', 'Disallow: /shared'].join('\n'),
    );
    assert.equal(isPathAllowed(rules, '/shared/thing'), false);
  });

  it('prefers a group naming Benson over the wildcard group', () => {
    const rules = parseRobotsTxt(
      [
        'User-agent: *',
        'Disallow: /',
        '',
        'User-agent: BensonBot',
        'Disallow: /admin',
      ].join('\n'),
    );
    assert.equal(isPathAllowed(rules, '/events/'), true);
    assert.equal(isPathAllowed(rules, '/admin/x'), false);
  });

  it('lets a more specific Allow override a broader Disallow', () => {
    const rules = parseRobotsTxt(
      ['User-agent: *', 'Disallow: /media', 'Allow: /media/press'].join('\n'),
    );
    assert.equal(isPathAllowed(rules, '/media/internal'), false);
    assert.equal(isPathAllowed(rules, '/media/press/kit'), true);
  });

  it('does not disallow everything when Disallow is empty', () => {
    // `Disallow:` with no value explicitly means "nothing is disallowed".
    const rules = parseRobotsTxt(['User-agent: *', 'Disallow:'].join('\n'));
    assert.deepEqual(rules.disallow, []);
    assert.equal(isPathAllowed(rules, '/anything'), true);
  });
});
