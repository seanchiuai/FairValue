import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CompareTray from './CompareTray';

describe('CompareTray', () => {
  it('renders property labels while keeping ids in removal callbacks', async () => {
    const onRemove = vi.fn();

    render(
      <MemoryRouter>
        <CompareTray
          propertyIds={['property-101']}
          propertyLabels={{ 'property-101': '101 Market Street' }}
          max={4}
          onRemove={onRemove}
          onClear={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('101 Market Street')).toBeInTheDocument();
    expect(screen.queryByText('property-101')).not.toBeInTheDocument();

    await screen.getByRole('button', { name: 'Remove property 101 Market Street from comparison' }).click();
    expect(onRemove).toHaveBeenCalledWith('property-101');
  });
});
