import { errorCode, ageBandLabel } from './format';
import { listingCache } from './listing-cache';
import { listing } from '../../test/fixtures';

describe('format', () => {
  it('labels age bands', () => {
    expect(ageBandLabel('55_plus')).toBe('55+');
    expect(ageBandLabel(null)).toBeNull();
  });

  it('extracts database error codes', () => {
    expect(errorCode(new Error('rate_limited'))).toBe('rate_limited');
    expect(errorCode('request_exists')).toBe('request_exists');
    expect(errorCode(new Error('Network request failed'))).toBeNull();
  });
});

describe('listingCache', () => {
  it('stores search results by id', () => {
    listingCache.put([listing({ id: 'a' }), listing({ id: 'b' })]);
    expect(listingCache.get('b')?.id).toBe('b');
    expect(listingCache.get('zzz')).toBeUndefined();
  });
});
