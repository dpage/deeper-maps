import { describe, expect, it } from 'vitest';
import {
  buildTemperatureColorExpression,
  buildTemperatureStyle,
  TEMPERATURE_LAYER_ID,
  TEMPERATURE_SOURCE_ID,
} from '../temperature';
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

describe('buildTemperatureColorExpression', () => {
  it('builds an interpolate expression that reflects the actual scale levels (regression: values 20-25 must not all clamp to one colour)', () => {
    const expr = buildTemperatureColorExpression({ min: 20.6, max: 24.4, levels: [20.6, 22.0, 24.4] });
    // Expression must be an array starting with 'interpolate'.
    expect(Array.isArray(expr)).toBe(true);
    expect((expr as unknown[])[0]).toBe('interpolate');
    // The actual temperature values must appear as numeric stops, not the
    // fallback [0, ..., 1, ...] range used at startup.
    const flat = JSON.stringify(expr);
    expect(flat).toContain('20.6');
    expect(flat).toContain('22');
    expect(flat).toContain('24.4');
  });

  it('falls back gracefully when levels is empty (returns stops spanning [0, 1])', () => {
    const expr = buildTemperatureColorExpression({ min: 0, max: 1, levels: [] });
    expect(Array.isArray(expr)).toBe(true);
    expect((expr as unknown[])[0]).toBe('interpolate');
    // With empty levels, quantileColorStops returns [0, startColor, 1, endColor].
    // The numeric 0 and 1 appear unquoted in JSON.
    const flat = JSON.stringify(expr);
    expect(flat).toContain(',0,');
    expect(flat).toContain(',1,');
  });
});
