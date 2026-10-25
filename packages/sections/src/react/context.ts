import type { PublicImage } from '@plp/contracts';

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
}
