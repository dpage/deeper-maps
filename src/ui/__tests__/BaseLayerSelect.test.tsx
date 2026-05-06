import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BaseLayerSelect } from '../BaseLayerSelect';

describe('<BaseLayerSelect/>', () => {
  it('renders the current value', () => {
    render(<BaseLayerSelect value="osm" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent(/openstreetmap|osm/i);
  });

  it('calls onChange when the user picks a different value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BaseLayerSelect value="osm" onChange={onChange} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /satellite/i }));
    expect(onChange).toHaveBeenCalledWith('satellite');
  });
});
