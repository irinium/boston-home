import { CELLS_ACROSS, clusterAction, clusterPoints, MAX_ZOOM_DELTA, type MapPoint } from './cluster';
import type { Region } from './geo';

const europe: Region = { latitude: 0, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 };
const p = (id: string, latitude: number, longitude: number): MapPoint => ({ id, latitude, longitude });

describe('clusterPoints', () => {
  it('returns nothing for no points', () => {
    expect(clusterPoints([], europe)).toEqual([]);
  });

  it('groups points in the same cell at their average, biggest group first', () => {
    const clusters = clusterPoints([p('a', 1, 1), p('b', 3, 3), p('c', 2, 2), p('far', -25, -25)], europe);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({ ids: ['a', 'b', 'c'], latitude: 2, longitude: 2 });
    expect(clusters[1].ids).toEqual(['far']);
  });

  it('splits groups as the map zooms in', () => {
    const points = [p('a', 1, 1), p('b', 3, 3)];
    expect(clusterPoints(points, europe)).toHaveLength(1);
    expect(clusterPoints(points, { latitude: 2, longitude: 2, latitudeDelta: 4, longitudeDelta: 4 })).toHaveLength(2);
  });

  it('uses shorter cells away from the equator, so they stay square on screen', () => {
    // 10 degrees wide / 6 cells = 1.67 degrees of longitude, but only ~0.83 of latitude at 60°N.
    const north: Region = { latitude: 60, longitude: 0, latitudeDelta: 5, longitudeDelta: 10 };
    expect(clusterPoints([p('a', 60.1, 0.1), p('b', 61.1, 0.1)], north)).toHaveLength(2);
    expect(clusterPoints([p('a', 0.1, 0.1), p('b', 1.1, 0.1)], { ...north, latitude: 0 })).toHaveLength(1);
  });

  it('treats longitudes past the antimeridian like their wrapped value', () => {
    const clusters = clusterPoints([p('a', 0, 179.5), p('b', 0, -180.5)], europe);
    expect(clusters).toHaveLength(1);
  });

  it('is deterministic for equal-sized groups', () => {
    const points = [p('x', -20, -20), p('y', 20, 20)];
    expect(clusterPoints(points, europe).map((c) => c.key)).toEqual(
      clusterPoints([...points].reverse(), europe).map((c) => c.key),
    );
    expect(CELLS_ACROSS).toBeGreaterThan(0);
  });
});

describe('clusterAction', () => {
  const points = [p('a', 10, 10), p('b', 12, 11), p('c', 40, 40)];

  it('opens a single listing', () => {
    expect(clusterAction({ key: 'k', latitude: 40, longitude: 40, ids: ['c'] }, europe, points)).toEqual({
      type: 'open',
      id: 'c',
    });
  });

  it('zooms into a group, fitting it with a margin', () => {
    const action = clusterAction({ key: 'k', latitude: 11, longitude: 10.5, ids: ['a', 'b'] }, europe, points);
    expect(action).toEqual({
      type: 'zoom',
      region: { latitude: 11, longitude: 10.5, latitudeDelta: 3.2, longitudeDelta: 3.2 },
    });
  });

  it('zooms in at least three times for a spread-out group', () => {
    const action = clusterAction({ key: 'k', latitude: 25, longitude: 25, ids: ['a', 'c'] }, europe, points);
    expect(action).toMatchObject({ type: 'zoom', region: { latitudeDelta: 20 } });
  });

  it('never zooms past the useful limit for points that nearly overlap', () => {
    const close = [p('a', 10, 10), p('b', 10.001, 10.001)];
    const region: Region = { latitude: 10, longitude: 10, latitudeDelta: 1, longitudeDelta: 1 };
    const action = clusterAction({ key: 'k', latitude: 10, longitude: 10, ids: ['a', 'b'] }, region, close);
    expect(action).toMatchObject({ type: 'zoom', region: { latitudeDelta: MAX_ZOOM_DELTA } });
  });

  it('lists a group that cannot be separated by zooming', () => {
    const region: Region = { latitude: 10, longitude: 10, latitudeDelta: 0.1, longitudeDelta: 0.1 };
    expect(clusterAction({ key: 'k', latitude: 10, longitude: 10, ids: ['a', 'b'] }, region, points)).toEqual({
      type: 'list',
      ids: ['a', 'b'],
    });
  });
});
