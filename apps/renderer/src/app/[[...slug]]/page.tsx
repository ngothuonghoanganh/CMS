import { notFound } from 'next/navigation';

// Release resolution (host → site → slug → release) arrives in slice S3.
// Until then no release exists, and the renderer must answer 404 rather than fall back to a draft.
export default function PublicPage(): never {
  notFound();
}
