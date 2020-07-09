import React from 'react';
import { render } from '@testing-library/react';
import Canvas from './canvas';

test('renders learn react link', () => {
  const { getByText } = render(<Canvas />);
  // const linkElement = getByText(/learn react/i);
  // expect(linkElement).toBeInTheDocument();
});
