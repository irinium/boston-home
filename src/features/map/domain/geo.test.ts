import { boundsKey, DEFAULT_REGION, initialRegion, normalizeLongitude, regionToBounds } from './geo';

describe('normalizeLongitude', () => {
  it.each([
    [0, 0],
    [190, -170],
    [-190, 170],
    [180, -180],
    [540, -180],
  ])('wraps %p to %p', (input, expected) => {
    expect(normalizeLongitude(input)).toBeCloseTo(expected);
  });
});

describe('regionToBounds', () => {
  it('turns a centre and deltas into a box', () => {
    expect(regionToBounds({ latitude: 50, longitude: 10, latitudeDelta: 2, longitudeDelta: 4 })).toEqual({
      south: 49,
      north: 51,
      west: 8,
      east: 12,
    });
  });

  it('clamps latitude at the poles', () => {
    const b = regionToBounds({ latitude: 85, longitude: 0, latitudeDelta: 20, longitudeDelta: 10 });
    expect(b.north).toBe(90);
    expect(b.south).toBe(75);
  });

  it('crosses the antimeridian with west > east', () => {
    const b = regionToBounds({ latitude: -17, longitude: 179, latitudeDelta: 4, longitudeDelta: 4 });
    expect(b.west).toBeCloseTo(177);
    expect(b.east).toBeCloseTo(-179);
  });

  it('covers every longitude when zoomed out past the whole world', () => {
    const b = regionToBounds({ latitude: 0, longitude: 30, latitudeDelta: 170, longitudeDelta: 400 });
    expect(b).toMatchObject({ west: -180, east: 180 });
  });
});

it('rounds the box key to about 1 km, so tiny jitters are the same query', () => {
  const a = boundsKey({ south: 1.001, west: 2.002, north: 3.003, east: 4.004 });
  const b = boundsKey({ south: 1.002, west: 2.001, north: 3.004, east: 4.003 });
  const c = boundsKey({ south: 1.2, west: 2.002, north: 3.003, east: 4.004 });
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

describe('initialRegion', () => {
  it('uses the default area without a location filter', () => {
    expect(initialRegion({ country: 'IT' })).toBe(DEFAULT_REGION);
  });

  it('centres on the radius filter', () => {
    const r = initialRegion({ lat: 41.9, lng: 12.5, radiusKm: 25 });
    expect(r).toMatchObject({ latitude: 41.9, longitude: 12.5 });
    expect(r.latitudeDelta).toBeCloseTo((25 * 2 * 1.2) / 111.32);
  });

  it('never opens closer than the 10 km minimum and defaults to 50 km', () => {
    expect(initialRegion({ lat: 1, lng: 1, radiusKm: 1 }).latitudeDelta).toBeCloseTo((10 * 2 * 1.2) / 111.32);
    expect(initialRegion({ lat: 1, lng: 1 }).latitudeDelta).toBeCloseTo((50 * 2 * 1.2) / 111.32);
  });
});
