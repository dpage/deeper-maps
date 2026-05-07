import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

function Throwing(): JSX.Element {
  throw new Error('boom');
}

describe('<ErrorBoundary/>', () => {
  it('catches a child error and renders the fallback', () => {
    // Suppress React's error log during this test.
    const orig = console.error;
    console.error = vi.fn();
    try {
      render(
        <ErrorBoundary>
          <Throwing />
        </ErrorBoundary>,
      );
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText(/boom/)).toBeInTheDocument();
    } finally {
      console.error = orig;
    }
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="ok">ok</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });

  // Coverage extension: clicking Reload calls window.location.reload(). jsdom's
  // location.reload is a non-mockable getter on the real Location prototype,
  // so we replace it via Object.defineProperty for the duration of the test.
  it('clicking Reload calls window.location.reload', async () => {
    const orig = console.error;
    console.error = vi.fn();
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
    try {
      const user = userEvent.setup();
      render(
        <ErrorBoundary>
          <Throwing />
        </ErrorBoundary>,
      );
      await user.click(screen.getByRole('button', { name: /reload/i }));
      expect(reloadSpy).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
      console.error = orig;
    }
  });
});
