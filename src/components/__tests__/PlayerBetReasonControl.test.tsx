import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PlayerBetReasonControl from '../player/PlayerBetReasonControl';

describe('PlayerBetReasonControl', () => {
  it('captures public bet reasoning with a remaining character count', async () => {
    const onChange = vi.fn();
    render(
      <PlayerBetReasonControl
        value="Comp"
        maxLength={20}
        describedBy="bet-error"
        invalid={false}
        onChange={onChange}
      />
    );

    await userEvent.type(screen.getByLabelText('Public bet reason'), ' signal');

    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('Public, replayed with this bet.')).toBeInTheDocument();
  });
});
