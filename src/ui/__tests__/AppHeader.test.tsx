import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../AppHeader';

describe('<AppHeader/>', () => {
  it('renders the app title and the base-layer + help controls, and toggles the help dialog', async () => {
    const user = userEvent.setup();
    render(
      <AppHeader
        baseLayer="osm"
        onBaseLayerChange={vi.fn()}
        viewMode="2d"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Deeper Maps/i)).toBeInTheDocument();
    const helpButton = screen.getByRole('button', { name: /help/i });
    expect(helpButton).toBeInTheDocument();
    await user.click(helpButton);
    expect(screen.getByText(/About Deeper Maps/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close/i }));
  });

  it('renders the view-mode selector and reports a change to 3D', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    render(
      <AppHeader
        baseLayer="osm"
        onBaseLayerChange={vi.fn()}
        viewMode="2d"
        onViewModeChange={onViewModeChange}
      />,
    );
    const viewModeCombo = screen
      .getAllByRole('combobox')
      .find((el) => /2D map/i.test(el.textContent ?? ''));
    await user.click(viewModeCombo!);
    await user.click(screen.getByRole('option', { name: /3D lake bed/i }));
    expect(onViewModeChange).toHaveBeenCalledWith('3d');
  });
});
