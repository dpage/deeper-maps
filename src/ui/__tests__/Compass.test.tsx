import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDeeperMapsStore } from '../../state/store';
import { Compass } from '../Compass';

beforeEach(() => {
  useDeeperMapsStore.setState({ viewBearing: 0, resetNorthSeq: 0 });
});

describe('<Compass/>', () => {
  it('renders a reset-to-north button', () => {
    render(<Compass />);
    expect(screen.getByRole('button', { name: /north/i })).toBeInTheDocument();
  });

  it('rotates the needle opposite the current bearing', () => {
    useDeeperMapsStore.setState({ viewBearing: 90 });
    render(<Compass />);
    const svg = screen.getByRole('button', { name: /north/i }).querySelector('svg');
    expect(svg?.getAttribute('style') ?? '').toContain('rotate(-90deg)');
  });

  it('clicking eases the map back to north (bumps resetNorthSeq)', async () => {
    const user = userEvent.setup();
    render(<Compass />);
    await user.click(screen.getByRole('button', { name: /north/i }));
    expect(useDeeperMapsStore.getState().resetNorthSeq).toBe(1);
  });
});
