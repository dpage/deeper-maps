import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../AppHeader';

describe('<AppHeader/>', () => {
  it('renders the app title and the base-layer + help controls, and toggles the help dialog', async () => {
    const user = userEvent.setup();
    render(<AppHeader baseLayer="osm" onBaseLayerChange={vi.fn()} />);
    expect(screen.getByText(/Deeper Maps/i)).toBeInTheDocument();
    const helpButton = screen.getByRole('button', { name: /help/i });
    expect(helpButton).toBeInTheDocument();
    await user.click(helpButton);
    expect(screen.getByText(/About Deeper Maps/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close/i }));
  });
});
