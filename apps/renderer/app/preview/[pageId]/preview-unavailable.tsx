import type { PreviewPageUnavailableReason } from '../../lib/page-api';

const cmsBaseUrl = process.env.NEXT_PUBLIC_CMS_BASE_URL ?? 'http://127.0.0.1:3000';

function cmsOrigin(): string {
  try {
    return new URL(cmsBaseUrl).origin;
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

const copy: Record<PreviewPageUnavailableReason, { title: string; description: string }> =
  {
    authentication: {
      title: 'Preview session unavailable',
      description:
        'The preview session has expired or is not available to the renderer. Return to the CMS and open Preview again.',
    },
    forbidden: {
      title: 'Preview not permitted',
      description:
        'Your current workspace does not have permission to preview this draft page.',
    },
    'not-found': {
      title: 'Preview unavailable',
      description:
        'This draft page is not available in the current workspace. Return to the CMS and open Preview again.',
    },
  };

export function PreviewUnavailable({ reason }: { reason: PreviewPageUnavailableReason }) {
  const message = copy[reason];
  return (
    <main
      className="renderer-message"
      data-preview-reason={reason}
      data-renderer-state="preview-unavailable"
    >
      <h1>{message.title}</h1>
      <p>{message.description}</p>
      <a href={cmsOrigin()}>Return to CMS</a>
    </main>
  );
}
