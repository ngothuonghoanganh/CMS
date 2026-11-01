import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAddress } from '../../../features/shell/admin-address';
import { renderWithProviders } from '../../../features/shell/test-utils';
import SignupPage from '../signup/page';
import LoginPage from './page';

class Redirected extends Error {}
const redirect = vi.fn((href: string) => {
  throw new Redirected(href);
});
vi.mock('next/navigation', () => ({
  redirect: (href: string) => redirect(href),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

let address: AdminAddress = { kind: 'single' };
vi.mock('../../../features/shell/current-address', () => ({
  currentAddress: () => Promise.resolve(address),
}));

const addresses = {
  template: 'https://{slug}.app.example.vn',
  commonOrigin: 'https://app.example.vn',
};
const noQuery = () => Promise.resolve({});

beforeEach(() => {
  address = { kind: 'single' };
  redirect.mockClear();
});

describe('login and sign-up with workspace addresses (ADR-025)', () => {
  it('says which address the login opens (screen 34)', async () => {
    address = { kind: 'workspace', slug: 'may-xanh', addresses };
    renderWithProviders(await LoginPage({ searchParams: noQuery() }));

    expect(screen.getByText('may-xanh.app.example.vn')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo workspace mới' })).toHaveAttribute(
      'href',
      'https://app.example.vn/signup',
    );
    expect(screen.getByRole('link', { name: 'Xem tất cả workspace' })).toHaveAttribute(
      'href',
      'https://app.example.vn/',
    );
  });

  it('tells at the common address that a workspace is picked after signing in', async () => {
    address = { kind: 'common', addresses };
    renderWithProviders(await LoginPage({ searchParams: noQuery() }));

    expect(screen.getByText(/bạn chọn workspace muốn mở/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Xem tất cả workspace' })).not.toBeInTheDocument();
  });

  it('keeps the single address as it was', async () => {
    renderWithProviders(await LoginPage({ searchParams: noQuery() }));
    expect(screen.getByRole('link', { name: 'Tạo tài khoản' })).toHaveAttribute('href', '/signup');
  });

  it('signs up at the common address, never at a workspace’s', async () => {
    address = { kind: 'workspace', slug: 'may-xanh', addresses };
    await expect(SignupPage({ searchParams: noQuery() })).rejects.toBeInstanceOf(Redirected);
    expect(redirect).toHaveBeenCalledWith('https://app.example.vn/signup');

    address = { kind: 'common', addresses };
    renderWithProviders(await SignupPage({ searchParams: noQuery() }));
    expect(screen.getByRole('heading', { name: 'Tạo tài khoản' })).toBeInTheDocument();
  });
});
