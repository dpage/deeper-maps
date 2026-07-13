import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpPanel } from '../HelpPanel';

describe('<HelpPanel/>', () => {
  it('renders nothing visible when closed', () => {
    render(<HelpPanel open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('heading', { name: /Help & guide/i })).toBeNull();
  });

  it('shows the first category by default', () => {
    render(<HelpPanel open onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Help & guide/i })).toBeInTheDocument();
    // "Getting started" is both a tab and the content heading.
    expect(screen.getByRole('tab', { name: /Getting started/i })).toBeInTheDocument();
    expect(screen.getByText(/turns a Deeper sonar scan/i)).toBeInTheDocument();
  });

  it('switches content when a category is selected', async () => {
    const user = userEvent.setup();
    render(<HelpPanel open onClose={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: /Fine-tuning/i }));
    // Content specific to the Fine-tuning section.
    expect(screen.getByText(/carp, bream and tench/i)).toBeInTheDocument();
    expect(screen.getByText(/Lift-out detection/i)).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HelpPanel open onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close help/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders in the mobile layout (horizontal tabs) too', () => {
    // Force the mobile breakpoint: match `down('sm')` queries.
    const original = window.matchMedia;
    window.matchMedia = ((query: string): MediaQueryList => ({
      matches: /max-width/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) satisfies typeof window.matchMedia;
    try {
      render(<HelpPanel open onClose={vi.fn()} />);
      expect(screen.getByRole('heading', { name: /Help & guide/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Getting started/i })).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it('covers the main areas of the app', () => {
    render(<HelpPanel open onClose={vi.fn()} />);
    for (const cat of [
      'Getting started',
      'Views & the map',
      'The 3D lake bed',
      'Layers',
      'Sweet spots',
      'Inspecting spots',
      'Fine-tuning',
      'Your scans',
      'About & privacy',
    ]) {
      expect(screen.getByRole('tab', { name: cat })).toBeInTheDocument();
    }
  });
});
