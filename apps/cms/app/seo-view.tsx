'use client';

import type { Collection, Page, PageSeoSettings } from '@payload/contracts';
import type { FormEvent } from 'react';

export function SeoView({
  pages,
  selectedPageId,
  settings,
  busy,
  onSelectPage,
  onSave,
  collections = [],
}: {
  pages: Page[];
  selectedPageId: string;
  settings: PageSeoSettings | null;
  busy: boolean;
  onSelectPage: (pageId: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  collections?: Collection[];
}) {
  const page = pages.find((candidate) => candidate.id === selectedPageId);
  const collection = page?.collectionId
    ? collections.find((candidate) => candidate.id === page.collectionId)
    : undefined;
  const value = (key: keyof PageSeoSettings) => {
    const candidate = settings?.[key];
    return typeof candidate === 'string' ? candidate : '';
  };
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Settings</span>
        <h1>SEO</h1>
        <p className="muted">
          Configure search and social metadata without changing the page payload contract.
        </p>
      </div>
      <section className="panel">
        <label className="inline-field">
          Page
          <select
            aria-label="Page"
            value={selectedPageId}
            onChange={(event) => onSelectPage(event.target.value)}
          >
            <option value="">Choose a page</option>
            {pages.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      {!page ? (
        <section className="panel">
          <div className="empty-state">
            <strong>Select a page</strong>
            <span className="muted">SEO settings are stored per page.</span>
          </div>
        </section>
      ) : (
        <form className="panel stack" key={selectedPageId} onSubmit={onSave}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{page.name}</span>
              <h2>Search metadata</h2>
            </div>
          </div>
          <label>
            SEO title
            <input name="title" defaultValue={value('title')} maxLength={200} />
          </label>
          <label>
            Meta description
            <textarea
              name="description"
              defaultValue={value('description')}
              maxLength={500}
              rows={4}
            />
          </label>
          <label>
            Canonical URL
            <input
              name="canonicalUrl"
              defaultValue={value('canonicalUrl')}
              placeholder="https://example.com/"
            />
          </label>
          <div className="two-column">
            <label className="checkbox-field">
              <input
                name="noIndex"
                type="checkbox"
                defaultChecked={settings?.noIndex ?? false}
              />{' '}
              <span>noindex</span>
            </label>
            <label className="checkbox-field">
              <input
                name="noFollow"
                type="checkbox"
                defaultChecked={settings?.noFollow ?? false}
              />{' '}
              <span>nofollow</span>
            </label>
          </div>
          <details>
            <summary>Open Graph and Twitter/X</summary>
            <div className="stack compact-stack">
              <label>
                Open Graph title
                <input name="ogTitle" defaultValue={value('ogTitle')} maxLength={200} />
              </label>
              <label>
                Open Graph description
                <textarea
                  name="ogDescription"
                  defaultValue={value('ogDescription')}
                  maxLength={500}
                  rows={3}
                />
              </label>
              <label>
                Open Graph image URL
                <input name="ogImage" defaultValue={value('ogImage')} />
              </label>
              <label>
                Twitter/X card
                <select
                  name="twitterCard"
                  defaultValue={settings?.twitterCard ?? 'summary'}
                >
                  <option value="summary">summary</option>
                  <option value="summary_large_image">summary_large_image</option>
                </select>
              </label>
              <label>
                Twitter/X title
                <input
                  name="twitterTitle"
                  defaultValue={value('twitterTitle')}
                  maxLength={200}
                />
              </label>
              <label>
                Twitter/X description
                <textarea
                  name="twitterDescription"
                  defaultValue={value('twitterDescription')}
                  maxLength={500}
                  rows={3}
                />
              </label>
              <label>
                Twitter/X image URL
                <input name="twitterImage" defaultValue={value('twitterImage')} />
              </label>
            </div>
          </details>
          <label>
            Favicon URL
            <input name="favicon" defaultValue={value('favicon')} />
          </label>
          {page.kind === 'dynamic' ? (
            <details open>
              <summary>Dynamic SEO bindings</summary>
              <p className="muted small">
                Bind metadata to the current published entry. Empty fields use the
                fallback above.
              </p>
              <div className="stack compact-stack">
                {(
                  ['title', 'description', 'ogTitle', 'ogDescription', 'ogImage'] as const
                ).map((target) => (
                  <label key={target}>
                    {target} field
                    <select
                      name={`binding.${target}`}
                      defaultValue={settings?.bindings?.[target]?.source.path ?? ''}
                    >
                      <option value="">No binding</option>
                      {(collection?.fields ?? [])
                        .filter((field) => field.status === 'active')
                        .map((field) => (
                          <option key={field.id} value={field.key}>
                            {field.label} · {field.key}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          ) : null}
          <div className="panel seo-preview">
            <span className="muted small">Search preview</span>
            <strong>{value('title') || page.name}</strong>
            <span className="linkish">
              {value('canonicalUrl') || `/${page.slug ?? ''}`}
            </span>
            <span className="muted">
              {value('description') || 'Add a description to control the search snippet.'}
            </span>
          </div>
          <button className="button button-primary" disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Save SEO settings'}
          </button>
        </form>
      )}
    </>
  );
}
