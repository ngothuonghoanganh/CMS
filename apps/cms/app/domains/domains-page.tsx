'use client';

import {
  CustomDomainListResponseSchema,
  PageListResponseSchema,
  SiteListResponseSchema,
  type CustomDomain,
  type Page,
  type Site,
} from '@payload/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { useCmsShell } from '../cms-shell';
import { ApiClientError, api } from '../lib/api';
import { DomainsView } from './domains-view';

type DomainForm = {
  hostname: string;
  siteId: string;
  landingPageId: string;
  isPrimary: boolean;
};
const blankForm: DomainForm = {
  hostname: '',
  siteId: '',
  landingPageId: '',
  isPrimary: false,
};

export default function DomainsPage() {
  const { workspaceId } = useCmsShell();
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function load() {
    try {
      const [domainResponse, siteResponse] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/domains`),
        api.get(`/workspaces/${workspaceId}/sites?limit=100&offset=0`),
      ]);
      setDomains(CustomDomainListResponseSchema.parse(domainResponse).items);
      const nextSites = SiteListResponseSchema.parse(siteResponse).items;
      setSites(nextSites);
      const pageResponses = await Promise.all(
        nextSites.map((site) => api.get(`/sites/${site.id}/pages?limit=100`)),
      );
      setPages(
        pageResponses.flatMap((response) => PageListResponseSchema.parse(response).items),
      );
    } catch (caughtError) {
      setError(message(caughtError));
    }
  }
  useEffect(() => {
    void load();
  }, [workspaceId]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await run();
    } catch (caughtError) {
      setError(message(caughtError));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return action(async () => {
      const created = await api.post<CustomDomain>(`/workspaces/${workspaceId}/domains`, {
        hostname: form.hostname,
        ...(form.siteId ? { siteId: form.siteId } : {}),
        ...(form.landingPageId ? { landingPageId: form.landingPageId } : {}),
        ...(form.isPrimary ? { isPrimary: true } : {}),
      });
      setDomains((current) => [created, ...current]);
      setForm(blankForm);
      setNotice('Domain added. Add the DNS TXT record before verifying it.');
    });
  }
  return (
    <>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      ) : null}
      <DomainsView
        busy={busy}
        domains={domains}
        form={form}
        onChange={setForm}
        onRemove={(domain) =>
          void action(async () => {
            await api.delete(`/workspaces/${workspaceId}/domains/${domain.id}`);
            setDomains((current) => current.filter((item) => item.id !== domain.id));
            setNotice('Domain removed.');
          })
        }
        onSubmit={(event) => void submit(event)}
        onUpdate={(domain, input) =>
          void action(async () => {
            const updated = await api.patch<CustomDomain>(
              `/workspaces/${workspaceId}/domains/${domain.id}`,
              input,
            );
            setDomains((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
            setNotice('Domain assignment updated.');
          })
        }
        onVerify={(domain) =>
          void action(async () => {
            const updated = await api.post<CustomDomain>(
              `/workspaces/${workspaceId}/domains/${domain.id}/verify`,
            );
            setDomains((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
            setNotice(
              updated.status === 'active'
                ? 'Domain verified and active.'
                : 'Verification record not found yet.',
            );
          })
        }
        pages={pages}
        sites={sites}
      />
    </>
  );
}
function message(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Unable to load domains.';
}
