import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LinkComponentProps } from '../Button/ButtonLink';
import { TabsNav } from './TabsNav';

const items = [
  { href: '/sites/s/pages/p/edit', label: 'Nội dung' },
  { href: '/sites/s/pages/p/seo', label: 'SEO & chia sẻ', current: true },
  { href: '/sites/s/pages/p/history', label: 'Lịch sử phiên bản' },
];

describe('TabsNav', () => {
  it('is a named navigation of links with aria-current on the current one', () => {
    render(<TabsNav aria-label="Mục của trang" items={items} />);
    const nav = screen.getByRole('navigation', { name: 'Mục của trang' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SEO & chia sẻ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Nội dung' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Lịch sử phiên bản' })).toHaveAttribute(
      'href',
      '/sites/s/pages/p/history',
    );
  });

  it('renders through a framework link component', () => {
    function RouterLink(props: LinkComponentProps) {
      return <a {...props} data-router="yes" />;
    }
    render(<TabsNav aria-label="Mục của trang" items={items} as={RouterLink} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('data-router', 'yes');
    }
  });
});
