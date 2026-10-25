import type { PublicImage, PublicLeadCapture } from '@plp/contracts';
import type { ReactNode } from 'react';
import type { LeadFormViewProps } from './lead-form-view.js';

/**
 * What a section needs from its host. The renderer passes published data in "live" mode; the
 * admin canvas passes the draft in "edit" mode with `onTextChange` for inline editing.
 */
export interface RenderContext {
  mode: 'live' | 'edit';
  site: { name: string; logo: PublicImage | null };
  /** Uploaded images by asset id. */
  images: Readonly<Record<string, PublicImage>>;
  /** Live path of linked pages by page id ("/", "/uu-dai"), null when not live. */
  pagePaths: Readonly<Record<string, string | null>>;
  /** Edit mode: commits text typed on the canvas through the editor's `updateContent` command. */
  onTextChange?: (sectionId: string, path: string, value: string) => void;
  /**
   * Consent texts of the lead form (ADR-017): the release snapshot on live pages and release
   * previews, the current settings on the canvas and in draft previews; null when there are none.
   */
  leadCapture: PublicLeadCapture | null;
  /**
   * Live pages only: the release the visitor sees and the host's interactive form, a client
   * component that renders `LeadFormView`. Absent on the canvas and in previews, where the form
   * never sends; the section then renders the plain view.
   */
  leadSubmission?: LeadSubmission;
}

export interface LeadSubmission {
  releaseId: string;
  render: (view: LeadFormViewProps) => ReactNode;
}
