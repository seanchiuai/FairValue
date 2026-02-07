import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Markets from './pages/Markets';

test('renders Markets page with FairValue branding', () => {
  render(
    <MemoryRouter>
      <Markets />
    </MemoryRouter>
  );
  expect(screen.getByText('FairValue')).toBeInTheDocument();
  expect(screen.getByText('Host a Bid')).toBeInTheDocument();
});
