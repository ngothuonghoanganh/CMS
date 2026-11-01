import type { PublicPreviewResponse, PublicPreviewStatusResponse } from '@plp/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  type PreviewLookup,
  type PreviewStatusLookup,
  previewForHost,
  previewStatusForHost,
  previewTokenOf,
} from './preview-gate';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJraW5kIjoiZHJhZnQifQ.c2lnbmF0dXJl';

function previewOf(subdomain: string): PublicPreviewResponse {
  return {
    data: {
      site: {
        id: 'a'.repeat(24),
        name: 'Smile Care',
        subdomain,
        themePresetId: 'mint',
        logo: null,
        origin: `http://${subdomain}.localhost:3101`,
      },
      page: {
        id: 'b'.repeat(24),
        slug: '',
        seo: {
          title: 'Smile Care',
          description: '',
          shareImage: null,
          noindex: false,
          canonicalUrl: `http://${subdomain}.localhost:3101/`,
        },
        composition: { version: 1, sections: [] },
      },
      assets: {},
      pageLinks: {},
      releaseId: null,
      leadCapture: null,
    },
    preview: { kind: 'draft', version: null, expiresAt: '2026-11-07T08:00:00.000Z' },
  };
}

function lookup(answer: PublicPreviewResponse | null | Error) {
  return vi.fn<PreviewLookup>(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  );
}

describe('previewTokenOf', () => {
  it('reads the token of a preview URL and nothing else', () => {
    expect(previewTokenOf(`/_preview/${TOKEN}`)).toBe(TOKEN);
    expect(previewTokenOf('/_preview/a%2Eb')).toBe('a.b');
    expect(previewTokenOf('/_preview/')).toBeNull();
    expect(previewTokenOf(`/_preview/${TOKEN}/x`)).toBeNull();
    expect(previewTokenOf('/uu-dai')).toBeNull();
    expect(previewTokenOf(`/x/_preview/${TOKEN}`)).toBeNull();
  });

  it('turns a malformed escape into a token no check accepts', () => {
    expect(previewTokenOf('/_preview/%E0%A4%A')).toBe('');
  });
});

describe('previewForHost', () => {
  it('opens a valid token on the host of its own site', async () => {
    const preview = previewOf('smilecare');
    const found = lookup(preview);
    await expect(previewForHost({ subdomain: 'smilecare', token: TOKEN }, found)).resolves.toBe(
      preview,
    );
    expect(found).toHaveBeenCalledWith(TOKEN);
  });

  // The API answers 404 for an expired token, another key id or a bad signature.
  it('is null for a token the API does not accept', async () => {
    await expect(
      previewForHost({ subdomain: 'smilecare', token: TOKEN }, lookup(null)),
    ).resolves.toBeNull();
  });

  it('is null for a token of another site, so a link cannot be opened on a foreign host', async () => {
    await expect(
      previewForHost({ subdomain: 'smilecare', token: TOKEN }, lookup(previewOf('nhakhoakhac'))),
    ).resolves.toBeNull();
  });

  it('is null without asking the API for a host that is not a site or a string that is no token', async () => {
    const never = lookup(previewOf('smilecare'));
    await expect(previewForHost({ subdomain: null, token: TOKEN }, never)).resolves.toBeNull();
    await expect(
      previewForHost({ subdomain: 'smilecare', token: 'abc' }, never),
    ).resolves.toBeNull();
    await expect(previewForHost({ subdomain: 'smilecare', token: '' }, never)).resolves.toBeNull();
    expect(never).not.toHaveBeenCalled();
  });

  it('lets an API failure through, so the caller answers 503 rather than 404', async () => {
    const error = new Error('API down');
    await expect(
      previewForHost({ subdomain: 'smilecare', token: TOKEN }, lookup(error)),
    ).rejects.toBe(error);
  });
});

describe('previewStatusForHost', () => {
  function statusLookup(answer: PublicPreviewStatusResponse | null | Error) {
    return vi.fn<PreviewStatusLookup>(() =>
      answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
    );
  }

  it('accepts a valid token on the host of its own site, from the status alone', async () => {
    const status: PublicPreviewStatusResponse = { kind: 'release', subdomain: 'smilecare' };
    const found = statusLookup(status);
    await expect(
      previewStatusForHost({ subdomain: 'smilecare', token: TOKEN }, found),
    ).resolves.toBe(status);
    expect(found).toHaveBeenCalledWith(TOKEN);
  });

  it('is null for a token the API does not accept or a token of another site', async () => {
    await expect(
      previewStatusForHost({ subdomain: 'smilecare', token: TOKEN }, statusLookup(null)),
    ).resolves.toBeNull();
    await expect(
      previewStatusForHost(
        { subdomain: 'smilecare', token: TOKEN },
        statusLookup({ kind: 'draft', subdomain: 'nhakhoakhac' }),
      ),
    ).resolves.toBeNull();
  });

  it('is null without asking the API for a host that is not a site or a string that is no token', async () => {
    const never = statusLookup({ kind: 'draft', subdomain: 'smilecare' });
    await expect(
      previewStatusForHost({ subdomain: null, token: TOKEN }, never),
    ).resolves.toBeNull();
    await expect(
      previewStatusForHost({ subdomain: 'smilecare', token: 'abc' }, never),
    ).resolves.toBeNull();
    expect(never).not.toHaveBeenCalled();
  });

  it('lets an API failure through, so the proxy answers 503 rather than 404', async () => {
    const error = new Error('API down');
    await expect(
      previewStatusForHost({ subdomain: 'smilecare', token: TOKEN }, statusLookup(error)),
    ).rejects.toBe(error);
  });
});
