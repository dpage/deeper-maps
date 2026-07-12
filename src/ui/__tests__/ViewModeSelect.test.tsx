import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewModeSelect } from '../ViewModeSelect';

describe('<ViewModeSelect/>', () => {
  it('renders the current value', () => {
    render(<ViewModeSelect value="2d" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent(/2D map/i);
  });

  it('renders the 3D value', () => {
    render(<ViewModeSelect value="3d" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent(/3D lake bed/i);
  });

  it('calls onChange when the user switches to 3D', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ViewModeSelect value="2d" onChange={onChange} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /3D lake bed/i }));
    expect(onChange).toHaveBeenCalledWith('3d');
  });
});
