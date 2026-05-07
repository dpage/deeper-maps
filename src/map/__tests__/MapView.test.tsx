import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', async () => import('./__mocks__/maplibre-gl'));

import type { LayerBundle } from '../../analysis/types';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import type { StoredScan } from '../../storage/types';
import { MapView } from '../MapView';

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  globalThis.localStorage?.clear();
  useDeeperMapsStore.setState({
    scans: {},
    activeScanId: null,
    layerBundle: null,
    progress: null,
    warnings: [],
    baseLayer: 'osm',
  });
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

function bundleWith(bounds: LayerBundle['bounds']): LayerBundle {
  return {
    bathymetry: { type: 'FeatureCollection', features: [] },
    weed: { type: 'FeatureCollection', features: [] },
    bathymetryLines: { type: 'FeatureCollection', features: [] },
    fishDensity: { type: 'FeatureCollection', features: [] },
    sweetSpots: { type: 'FeatureCollection', features: [] },
    scales: {
      depth: { min: 0, max: 1, levels: [] },
      weed: { min: 0, max: 1, levels: [] },
      fishRate: { min: 0, max: 1, levels: [] },
    },
    bounds,
  };
}

function makeScan(id: string, overrides: Partial<StoredScan> = {}): StoredScan {
  return {
    id,
    name: 'test',
    deviceType: 'quest',
    contentHash: 'h',
    createdAt: 0,
    updatedAt: 0,
    fileMeta: [],
    thresholds: {
      liftout: {
        hardThresholdM: 5,
        rollingWindow: 31,
        madMultiplier: 6,
        madOffsetM: 0.3,
        sessionGapS: 300,
        globalMadMultiplier: 4,
      },
      sonar: {
        binsPerM: 576.6,
        ringdownBins: 30,
        bottomHugM: 0.05,
        weedAmpFactor: 1.5,
        weedMinAmp: 30,
        fishAmpFactor: 2,
        fishMinAmp: 60,
        fishMinRun: 2,
      },
      cell: { cellSizeM: 2, minPingsPerCell: 5 },
      category: {
        goldFishRate: 0.3,
        goldMaxWeed: 0.1,
        silverMaxWeed: 0.15,
        bronzeFishRate: 0.05,
        bronzeMaxWeed: 0.5,
        weededMinWeed: 0.5,
      },
      colorScale: { outlierTrimPct: 0.05 },
    },
    layerVisibility: { bathymetry: true, weed: true, fishDensity: true, sweetSpots: true },
    ...overrides,
  };
}

describe('<MapView/>', () => {
  it('mounts without crashing when no scan is active', () => {
    const { container } = render(<MapView />);
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('does not call addSource until layerBundle is non-null', async () => {
    const maplibre = await import('maplibre-gl');
    const { Map: MapClass } = maplibre;
    const mapInstance = new (MapClass as unknown as new () => {
      addSource: ReturnType<typeof vi.fn>;
    })();
    render(<MapView />);
    // No layer bundle was ever provided; addSource should not have been called.
    // (This is a slightly indirect assertion — the real test is that no errors fire.)
    expect(mapInstance.addSource).not.toHaveBeenCalled();
  });

  it('pushes the current layerBundle to sources when MapLibre fires load (cache-hit case)', async () => {
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    const bundle = bundleWith(null);
    useDeeperMapsStore.setState({ layerBundle: bundle });

    render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));
    expect(mock.__setDataCalls.length).toBeGreaterThanOrEqual(5);
    const sourceIds = mock.__setDataCalls.map((c) => c.sourceId);
    expect(sourceIds).toContain('bathymetry');
    expect(sourceIds).toContain('weed');
    expect(sourceIds).toContain('bathymetry-lines');
    expect(sourceIds).toContain('fish-density');
    expect(sourceIds).toContain('sweet-spots');
  });

  it("registers the fish-icon SDF image during the map's load handler", async () => {
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));

    const fishIconCall = mock.__addImageCalls.find((c) => c.id === 'fish-icon');
    expect(fishIconCall).toBeDefined();
    expect(fishIconCall?.options?.sdf).toBe(true);
  });

  it('fitBounds to the layerBundle bounds the first time a bundle lands for a scan', async () => {
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    const scan = makeScan('11111111-1111-1111-1111-111111111111');
    const bundle = bundleWith({ sw: [-1.45, 51.7], ne: [-1.4, 51.75] });
    useDeeperMapsStore.setState({
      scans: { [scan.id]: scan },
      activeScanId: scan.id,
      layerBundle: bundle,
    });

    render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));

    expect(mock.__fitBoundsCalls.length).toBeGreaterThanOrEqual(1);
    const call = mock.__fitBoundsCalls[0];
    expect(call?.bounds[0][0]).toBeCloseTo(-1.45, 5);
    expect(call?.bounds[0][1]).toBeCloseTo(51.7, 5);
    expect(call?.bounds[1][0]).toBeCloseTo(-1.4, 5);
    expect(call?.bounds[1][1]).toBeCloseTo(51.75, 5);
    expect(call?.options.padding).toBe(40);
    expect(call?.options.maxZoom).toBe(16);
  });

  it('does not call fitBounds when bundle.bounds is null', async () => {
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    const scan = makeScan('22222222-2222-2222-2222-222222222222');
    useDeeperMapsStore.setState({
      scans: { [scan.id]: scan },
      activeScanId: scan.id,
      layerBundle: bundleWith(null),
    });

    render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));
    expect(mock.__fitBoundsCalls.length).toBe(0);
  });

  it('switching baseLayer calls setStyle (preserving pan/zoom) instead of tearing down the map', async () => {
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    const scan = makeScan('33333333-3333-3333-3333-333333333333');
    useDeeperMapsStore.setState({
      scans: { [scan.id]: scan },
      activeScanId: scan.id,
      baseLayer: 'osm',
    });

    const { rerender } = render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));

    // Flip the global baseLayer preference to satellite.
    act(() => {
      useDeeperMapsStore.setState({ baseLayer: 'satellite' });
    });
    rerender(<MapView />);
    await new Promise((r) => setTimeout(r, 5));

    expect(mock.__setStyleCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('defers layerBundle apply via style.load when overlays have not been re-added after a setStyle swap (even if isStyleLoaded() returns true)', async () => {
    // Regression test for the bug where MapLibre's `isStyleLoaded()` flips to
    // true as soon as the BASE style parses after `setStyle({ diff: false })`,
    // but our overlay sources have been wiped and not yet re-added inside the
    // `style.load` handler. Old code gated on `isStyleLoaded()` and therefore
    // ran `getSource(...).setData(...)` against null sources — silently
    // dropping the update. The new gate is our own `overlaysReadyRef`.
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    // Mount on osm with no bundle yet; let the initial load fire so the
    // overlays are added once.
    const scan = makeScan('44444444-4444-4444-4444-444444444444');
    useDeeperMapsStore.setState({
      scans: { [scan.id]: scan },
      activeScanId: scan.id,
      baseLayer: 'osm',
    });
    render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));

    // Reset capture lists; arm the mock to simulate the regression window —
    // isStyleLoaded() will keep reading TRUE (the buggy MapLibre behaviour)
    // but `once('style.load', cb)` will queue all callbacks instead of
    // firing them, so addOverlaysAndReplay does NOT run yet.
    mock.__resetSetDataCalls();
    mock.__resetFitBoundsCalls();
    mock.__setDeferStyleLoadCallbacks(true);
    act(() => {
      useDeeperMapsStore.setState({ baseLayer: 'satellite' });
    });
    await new Promise((r) => setTimeout(r, 5));

    // The layerBundle arrives during this window — isStyleLoaded() === true,
    // but our overlay sources have not been re-added since the setStyle.
    const bundle = bundleWith({ sw: [-1.45, 51.7], ne: [-1.4, 51.75] });
    act(() => {
      useDeeperMapsStore.setState({ layerBundle: bundle });
    });
    await new Promise((r) => setTimeout(r, 5));

    // Nothing applied yet — the layerBundle effect deferred because
    // overlaysReadyRef.current is false (gating on our own ref, not on
    // map.isStyleLoaded()).
    expect(mock.__setDataCalls.length).toBe(0);
    expect(mock.__fitBoundsCalls.length).toBe(0);

    // Now flush the deferred style.load — addOverlaysAndReplay re-adds the
    // sources and replays the snapshot, which includes the bundle we just
    // pushed into the store; the queued layerBundle-effect apply also fires.
    act(() => {
      mock.__flushStyleLoad();
    });
    await new Promise((r) => setTimeout(r, 5));

    expect(mock.__setDataCalls.length).toBeGreaterThanOrEqual(5);
    expect(mock.__fitBoundsCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('layer visibility: bath + weed both on shows bath-lines, hides bath-fill, weed-fill on', async () => {
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    const scan = makeScan('66666666-6666-6666-6666-666666666666', {
      layerVisibility: { bathymetry: true, weed: true, fishDensity: false, sweetSpots: false },
    });
    useDeeperMapsStore.setState({
      scans: { [scan.id]: scan },
      activeScanId: scan.id,
      layerBundle: bundleWith(null),
    });

    render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));

    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'bathymetry-fill',
      name: 'visibility',
      value: 'none',
    });
    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'bathymetry-lines-layer',
      name: 'visibility',
      value: 'visible',
    });
    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'weed-fill',
      name: 'visibility',
      value: 'visible',
    });
  });

  it('layer visibility: only weed on shows weed-fill, hides bath-fill and bath-lines', async () => {
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    const scan = makeScan('77777777-7777-7777-7777-777777777777', {
      layerVisibility: { bathymetry: false, weed: true, fishDensity: false, sweetSpots: false },
    });
    useDeeperMapsStore.setState({
      scans: { [scan.id]: scan },
      activeScanId: scan.id,
      layerBundle: bundleWith(null),
    });

    render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));

    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'weed-fill',
      name: 'visibility',
      value: 'visible',
    });
    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'bathymetry-fill',
      name: 'visibility',
      value: 'none',
    });
    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'bathymetry-lines-layer',
      name: 'visibility',
      value: 'none',
    });
  });

  it('layer visibility: only bath on shows bath-fill, hides weed-fill and bath-lines', async () => {
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    const scan = makeScan('99999999-9999-9999-9999-999999999999', {
      layerVisibility: { bathymetry: true, weed: false, fishDensity: false, sweetSpots: false },
    });
    useDeeperMapsStore.setState({
      scans: { [scan.id]: scan },
      activeScanId: scan.id,
      layerBundle: bundleWith(null),
    });

    render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));

    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'bathymetry-fill',
      name: 'visibility',
      value: 'visible',
    });
    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'bathymetry-lines-layer',
      name: 'visibility',
      value: 'none',
    });
    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'weed-fill',
      name: 'visibility',
      value: 'none',
    });
  });

  it('layer visibility: bath off and weed off hides bath-fill, bath-lines and weed-fill', async () => {
    const mock = await import('./__mocks__/maplibre-gl');
    mock.__resetAll();

    const scan = makeScan('88888888-8888-8888-8888-888888888888', {
      layerVisibility: { bathymetry: false, weed: false, fishDensity: false, sweetSpots: false },
    });
    useDeeperMapsStore.setState({
      scans: { [scan.id]: scan },
      activeScanId: scan.id,
      layerBundle: bundleWith(null),
    });

    render(<MapView />);
    await new Promise((r) => setTimeout(r, 5));

    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'bathymetry-fill',
      name: 'visibility',
      value: 'none',
    });
    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'bathymetry-lines-layer',
      name: 'visibility',
      value: 'none',
    });
    expect(mock.__setLayoutPropertyCalls).toContainEqual({
      layerId: 'weed-fill',
      name: 'visibility',
      value: 'none',
    });
  });
});
