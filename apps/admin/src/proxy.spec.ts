// @vitest-environment node
import { SESSION_COOKIE } from '@plp/contracts';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { REQUEST_PATH_HEADER } from './features/shell/request-path';
import { proxy } from './proxy';

function page(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, 'https://may-xanh.app.example.vn'), {
    headers: { cookie: `${SESSION_COOKIE}=s`, ...headers },
  });
}

describe('proxy', () => {
  it('hands a page its own path, to open it at its workspace’s address (ADR-025)', () => {
    const response = proxy(page('/sites/1/leads?lead=2'));
    expect(response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)).toBe(
      '/sites/1/leads?lead=2',
    );
  });

  it('never passes on a path the browser sent', () => {
    const response = proxy(page('/sites/1', { [REQUEST_PATH_HEADER]: '//evil.test/x' }));
    expect(response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)).toBe('/sites/1');
  });

  it('opens the pages of account links without a session (ADR-026)', () => {
    for (const path of ['/signup/verify', '/forgot-password', '/reset-password']) {
      const response = proxy(new NextRequest(new URL(path, 'https://app.example.vn')));
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)).toBe(path);
    }
  });

  it('asks a visitor without a session to log in before the account page', () => {
    const response = proxy(new NextRequest(new URL('/account', 'https://app.example.vn')));
    expect(response.headers.get('location')).toBe('https://app.example.vn/login?next=%2Faccount');
  });

  it('sends a visitor without a session to the login page', () => {
    const response = proxy(new NextRequest(new URL('/sites/1', 'https://may-xanh.app.example.vn')));
    expect(response.headers.get('location')).toBe(
      'https://may-xanh.app.example.vn/login?next=%2Fsites%2F1',
    );
  });
});
