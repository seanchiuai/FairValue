import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JoinPage from './pages/JoinPage';

test('renders JoinPage with create and join options', () => {
  render(
    <MemoryRouter>
      <JoinPage />
    </MemoryRouter>
  );
  expect(screen.getByText('FairValue')).toBeInTheDocument();
  expect(screen.getByText('Create Room')).toBeInTheDocument();
  expect(screen.getByText('Join Room')).toBeInTheDocument();
});
