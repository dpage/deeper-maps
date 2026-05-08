import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { TemperatureStats } from '../TemperatureStats';
import { useDeeperMapsStore } from '../../state/store';

const EMPTY_BUNDLE = {
  bathymetry: { type: 'FeatureCollection' as const, features: [] },
  weed: { type: 'FeatureCollection' as const, features: [] },
  bathymetryLines: { type: 'FeatureCollection' as const, features: [] },
  fishDensity: { type: 'FeatureCollection' as const, features: [] },
  sweetSpots: { type: 'FeatureCollection' as const, features: [] },
  temperature: { type: 'FeatureCollection' as const, features: [] },
  scales: {
    depth: { min: 0, max: 1, levels: [] },
    weed: { min: 0, max: 1, levels: [] },
    fishRate: { min: 0, max: 1, levels: [] },
    temperature: { min: 0, max: 1, levels: [] },
  },
  bounds: null,
  tempStats: null as null | { min: number; mean: number; max: number },
};

describe('TemperatureStats', () => {
  beforeEach(() => {
    useDeeperMapsStore.setState({ layerBundle: null });
  });

  it('renders nothing when tempStats is null', () => {
    useDeeperMapsStore.setState({ layerBundle: { ...EMPTY_BUNDLE, tempStats: null } });
    const { container } = render(<TemperatureStats />);
    expect(container.firstChild).toBeNull();
  });

  it('renders min / avg / max °C when tempStats is populated', () => {
    useDeeperMapsStore.setState({
      layerBundle: { ...EMPTY_BUNDLE, tempStats: { min: 12.4, mean: 14.2, max: 16.7 } },
    });
    render(<TemperatureStats />);
    expect(screen.getByText(/Temperature/i)).toBeInTheDocument();
    expect(screen.getByText(/12\.4 \/ 14\.2 \/ 16\.7 °C/)).toBeInTheDocument();
    expect(screen.getByText(/min \/ avg \/ max/i)).toBeInTheDocument();
  });
});
