import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewSelect } from '../ViewSelect';

describe('<ViewSelect/>', () => {
  it('shows 3D Model when in 3D mode', () => {
    render(
      <ViewSelect
        viewMode="3d"
        baseLayer="osm"
        onViewModeChange={vi.fn()}
        onBaseLayerChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent(/3D Model/i);
  });

  it('reflects the basemap in the 2D value', () => {
    render(
      <ViewSelect
        viewMode="2d"
        baseLayer="satellite"
        onViewModeChange={vi.fn()}
        onBaseLayerChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent(/2D Satellite/i);
  });

  it('switching to 3D sets the view mode and leaves the basemap alone', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    const onBaseLayerChange = vi.fn();
    render(
      <ViewSelect
        viewMode="2d"
        baseLayer="osm"
        onViewModeChange={onViewModeChange}
        onBaseLayerChange={onBaseLayerChange}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /3D Model/i }));
    expect(onViewModeChange).toHaveBeenCalledWith('3d');
    expect(onBaseLayerChange).not.toHaveBeenCalled();
  });

  it('picking a 2D basemap sets both the basemap and 2D mode', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    const onBaseLayerChange = vi.fn();
    render(
      <ViewSelect
        viewMode="3d"
        baseLayer="osm"
        onViewModeChange={onViewModeChange}
        onBaseLayerChange={onBaseLayerChange}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /2D Satellite/i }));
    expect(onBaseLayerChange).toHaveBeenCalledWith('satellite');
    expect(onViewModeChange).toHaveBeenCalledWith('2d');
  });

  it('picking 2D OpenStreetMap sets osm + 2D mode', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    const onBaseLayerChange = vi.fn();
    render(
      <ViewSelect
        viewMode="2d"
        baseLayer="satellite"
        onViewModeChange={onViewModeChange}
        onBaseLayerChange={onBaseLayerChange}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /2D OpenStreetMap/i }));
    expect(onBaseLayerChange).toHaveBeenCalledWith('osm');
    expect(onViewModeChange).toHaveBeenCalledWith('2d');
  });
});
