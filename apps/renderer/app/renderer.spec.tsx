import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PagePayloadV1 } from '@payload/contracts';

import { renderPage } from './renderer';

function createPayload(): PagePayloadV1 {
  return {
    version: 1 as const,
    metadata: {
      documentTitle: 'Public launch',
      documentDescription: 'A public page.',
    },
    root: {
      id: 'root',
      type: 'root' as const,
      props: {},
      children: [
        {
          id: 'hero',
          type: 'section' as const,
          props: {},
          style: {
            base: { padding: '64px 24px' },
            tablet: { padding: '40px 20px' },
            mobile: { padding: '24px 16px' },
          },
          children: [
            {
              id: 'content',
              type: 'container' as const,
              props: {},
              children: [
                {
                  id: 'heading',
                  type: 'text' as const,
                  props: { text: 'Ship faster', align: 'center' as const },
                  children: [],
                },
                {
                  id: 'image',
                  type: 'image' as const,
                  props: { src: '/assets/hero.png', alt: 'Hero illustration' },
                  children: [],
                },
                {
                  id: 'cta',
                  type: 'button' as const,
                  props: {
                    label: 'Start now',
                    href: 'https://example.com/start',
                    target: '_blank' as const,
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe('PagePayloadV1 renderer', () => {
  it('renders the explicit node mapping and nested children as semantic HTML', () => {
    const markup = renderToStaticMarkup(renderPage(createPayload()));

    expect(markup).toContain('data-payload-node-type="root"');
    expect(markup).toContain('<section');
    expect(markup).toContain('<div');
    expect(markup).toContain('<p');
    expect(markup).toContain('Ship faster');
    expect(markup).toContain('<img');
    expect(markup).toContain('alt="Hero illustration"');
    expect(markup).toContain('<a');
    expect(markup).toContain('rel="noopener noreferrer"');
  });

  it('keeps base styles and emits controlled responsive rules', () => {
    const markup = renderToStaticMarkup(renderPage(createPayload()));

    expect(markup).toContain('padding:64px 24px');
    expect(markup).toContain('@media (max-width: 991px)');
    expect(markup).toContain('padding:40px 20px');
    expect(markup).toContain('@media (max-width: 479px)');
    expect(markup).toContain('padding:24px 16px');
  });

  it('fails safely for invalid or unsupported payload data', () => {
    const invalid = renderToStaticMarkup(
      renderPage({
        version: 1,
        metadata: { documentTitle: 'Invalid' },
        root: {
          id: 'root',
          type: 'root',
          props: {},
          children: [{ id: 'script', type: 'script', props: {}, children: [] }],
        },
      }),
    );

    expect(invalid).toContain('This page is temporarily unavailable.');
    expect(invalid).not.toContain('<script');
  });

  it('does not emit unsafe style values accepted by the generic style length bound', () => {
    const payload = createPayload();
    const hero = payload.root.children[0];
    if (!hero) {
      throw new Error('Test payload hero is missing');
    }
    hero.style = {
      base: { backgroundColor: 'url(javascript:alert(1))' },
    };

    const markup = renderToStaticMarkup(renderPage(payload));

    expect(markup).not.toContain('javascript');
    expect(markup).not.toContain('url(');
  });

  it('renders a V2 form with semantic controls and a published submission target', () => {
    const markup = renderToStaticMarkup(
      renderPage(
        {
          version: 2,
          metadata: { documentTitle: 'Contact' },
          root: {
            id: 'root',
            type: 'root',
            props: {},
            children: [
              {
                id: 'section',
                type: 'section',
                props: {},
                children: [
                  {
                    id: 'contact-form',
                    type: 'form',
                    props: {
                      fields: [
                        {
                          id: 'email',
                          type: 'email',
                          label: 'Email',
                          name: 'email',
                          required: true,
                        },
                        {
                          id: 'message',
                          type: 'textarea',
                          label: 'Message',
                          name: 'message',
                          required: false,
                        },
                      ],
                      submitLabel: 'Send',
                      successMessage: 'Thanks',
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        },
        { pageSlug: 'contact', siteSlug: 'demo' },
      ),
    );

    expect(markup).toContain('<form');
    expect(markup).toContain('for="payload-form-email"');
    expect(markup).toContain('type="email"');
    expect(markup).toContain('required');
    expect(markup).toContain('Send');
    expect(markup).not.toContain('dangerouslySetInnerHTML');
  });

  it('renders the trusted Countdown extension safely from a V3 payload', () => {
    const payload = {
      version: 3,
      metadata: { documentTitle: 'Countdown' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'section',
            type: 'section',
            props: {},
            children: [
              {
                id: 'launch',
                type: 'countdown',
                props: {
                  label: 'Launches soon',
                  targetAt: '2030-01-01T00:00:00.000Z',
                },
                children: [],
              },
            ],
          },
        ],
      },
    } as const;
    const markup = renderToStaticMarkup(renderPage(payload));
    expect(markup).toContain('Launches soon');
    expect(markup).toContain('dateTime="2030-01-01T00:00:00.000Z"');
    expect(markup).not.toContain('eval');

    const runtimeMarkup = renderToStaticMarkup(
      renderPage(payload, { runtimeIds: ['countdown.runtime'] }),
    );
    expect(runtimeMarkup).toContain('data-extension="demo-builder-countdown"');
    expect(runtimeMarkup).toContain('data-extension-runtime="countdown.runtime"');
  });

  it('renders a tenant custom extension from its declarative runtime definition', () => {
    const payload = {
      version: 3,
      metadata: { documentTitle: 'Custom extension' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'hero',
            type: 'section',
            props: {},
            children: [
              {
                id: 'custom-banner',
                type: 'extension',
                props: { extensionId: 'custom-launch', values: {} },
                children: [],
              },
            ],
          },
        ],
      },
    } as const;
    const markup = renderToStaticMarkup(
      renderPage(payload, {
        extensions: [
          {
            extensionId: 'custom-launch',
            runtimeIds: [],
            styleAssetIds: [],
            slots: [],
            custom: {
              id: 'custom-launch',
              name: 'Launch banner',
              version: '1.0.0',
              render: {
                kind: 'banner',
                eyebrow: 'Now live',
                heading: 'Launch your next campaign',
                body: 'A reusable tenant-defined landing page block.',
                buttonLabel: 'Learn more',
                buttonHref: '/learn',
                accentColor: '#8cf0c5',
              },
            },
          },
        ],
      }),
    );

    expect(markup).toContain('data-payload-node-type="extension"');
    expect(markup).toContain('data-extension="custom-launch"');
    expect(markup).toContain('Launch your next campaign');
    expect(markup).toContain('href="/learn"');
    expect(markup).not.toContain('dangerouslySetInnerHTML');
  });
});
