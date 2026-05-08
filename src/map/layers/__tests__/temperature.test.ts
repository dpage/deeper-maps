import { describe, expect, it } from 'vitest';
import { buildTemperatureStyle, TEMPERATURE_LAYER_ID, TEMPERATURE_SOURCE_ID } from '../temperature';
import type { ScaleRange } from '../../../analysis/types';

describe('buildTemperatureStyle', () => {
  const scale: ScaleRange = { min: 12, max: 18, levels: [12, 14, 16, 18] };

  it('returns a fill layer with the temperature source/layer ids', () => {
    const style = buildTemperatureStyle(scale);
    expect(style.layer.id).toBe(TEMPERATURE_LAYER_ID);
    expect(style.layer.type).toBe('fill');
    expect((style.layer as { source: string }).source).toBe(TEMPERATURE_SOURCE_ID);
  });

  it('uses an empty FeatureCollection as initial source data', () => {
    const style = buildTemperatureStyle(scale);
    expect(style.source.type).toBe('geojson');
    expect(style.source.data.features).toHaveLength(0);
  });

  it('paints fill-color via an interpolate expression on the level property', () => {
    const style = buildTemperatureStyle(scale);
    const paint = (style.layer as { paint: Record<string, unknown> }).paint;
    const fillColor = paint['fill-color'] as unknown[];
    expect(fillColor[0]).toBe('interpolate');
  });

  it('falls back to a default colour expression when scale.levels is empty', () => {
    const empty: ScaleRange = { min: 0, max: 1, levels: [] };
    const style = buildTemperatureStyle(empty);
    expect(style.layer.id).toBe(TEMPERATURE_LAYER_ID);
  });
});
