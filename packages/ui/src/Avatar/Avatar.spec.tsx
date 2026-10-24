import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it.each([
    ['Ngọc Anh', 'NA'],
    ['Mây Xanh Agency', 'MX'],
    ['  minh  ', 'M'],
    ['đức ân', 'ĐÂ'],
    ['', ''],
  ])('%j → %j', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe('Avatar', () => {
  it('is decorative next to a visible name by default', () => {
    const { container } = render(<Avatar name="Ngọc Anh" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveTextContent('NA');
  });

  it('can be announced on its own', () => {
    render(<Avatar name="Mây Xanh Agency" shape="square" size={28} labelled />);
    expect(screen.getByRole('img', { name: 'Mây Xanh Agency' })).toHaveTextContent('MX');
  });
});
