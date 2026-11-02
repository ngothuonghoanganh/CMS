import type { Composition, TemplateSiteReadiness } from '@plp/contracts';
import { collectLeaves } from '@plp/sections/schema';

/*
 * "Cần có trước khi xuất bản" of board 18, and the note of its create dialog, from what the API
 * says about a site (ADR-030). A template brings no lead recipients, consent text or photos: the
 * site has them or the publish checks block (ADR-016, ADR-017).
 */

export type ReadinessTone = 'ready' | 'missing' | 'info';

export interface ReadinessItem {
  key: 'recipients' | 'consent' | 'images';
  title: string;
  text: string;
  tone: ReadinessTone;
}

/** The image frames a page from the composition shows, and whether one must be filled. */
export function imageNeedsOf(composition: Composition): { any: boolean; required: boolean } {
  let any = false;
  let required = false;
  for (const section of composition.sections) {
    for (const leaf of collectLeaves(section)) {
      if (leaf.field.kind === 'image') {
        any = true;
        required ||= leaf.field.required === true;
      }
    }
  }
  return { any, required };
}

function recipientsItem(siteName: string, site: TemplateSiteReadiness | null): ReadinessItem {
  const title = 'Nơi nhận lead';
  if (site === null) {
    return {
      key: 'recipients',
      title,
      text: 'site cần một email nhận lead đã xác nhận',
      tone: 'info',
    };
  }
  if (site.confirmedRecipients === 0) {
    return {
      key: 'recipients',
      title,
      text: `${siteName} chưa có email nhận lead đã xác nhận`,
      tone: 'missing',
    };
  }
  const others = site.confirmedRecipients - 1;
  return {
    key: 'recipients',
    title,
    text:
      site.recipientEmail === null
        ? `${siteName} đã có ${site.confirmedRecipients} email nhận lead đã xác nhận`
        : `${siteName} đã có ${site.recipientEmail}${others > 0 ? ` và ${others} email khác` : ''}`,
    tone: 'ready',
  };
}

function consentItem(siteName: string, site: TemplateSiteReadiness | null): ReadinessItem {
  const title = 'Nội dung đồng ý';
  if (site === null) {
    return {
      key: 'consent',
      title,
      text: 'site cần nội dung đồng ý ở mục “Dữ liệu & đồng ý”',
      tone: 'info',
    };
  }
  if (site.consentGaps.includes('privacy')) {
    return {
      key: 'consent',
      title,
      text: `${siteName} chưa có đơn vị thu thập dữ liệu và link chính sách${site.consentGaps.includes('consent') ? ', chưa có nội dung đồng ý' : ''}`,
      tone: 'missing',
    };
  }
  if (site.consentGaps.includes('consent') || site.consentVersion === null) {
    return { key: 'consent', title, text: `${siteName} chưa có nội dung đồng ý`, tone: 'missing' };
  }
  return {
    key: 'consent',
    title,
    text: `${siteName} đang dùng phiên bản ${site.consentVersion}`,
    tone: 'ready',
  };
}

export interface ReadinessInput {
  hasForm: boolean;
  composition: Composition;
  /** The site the page would be made for; null when the user has none to make it for. */
  siteName: string | null;
  site: TemplateSiteReadiness | null;
}

/** The items of "Cần có trước khi xuất bản", in the board's order. */
export function readinessItems({
  hasForm,
  composition,
  siteName,
  site,
}: ReadinessInput): ReadinessItem[] {
  const name = siteName ?? 'Site';
  const reading = siteName === null ? null : site;
  const images = imageNeedsOf(composition);
  return [
    ...(hasForm ? [recipientsItem(name, reading), consentItem(name, reading)] : []),
    ...(images.any
      ? [
          {
            key: 'images' as const,
            title: 'Ảnh của bạn',
            text: images.required
              ? 'mẫu để trống khung ảnh; ảnh bắt buộc phải có trước khi xuất bản'
              : 'mẫu để trống khung ảnh, nên thêm ảnh thật của bạn',
            tone: 'info' as const,
          },
        ]
      : []),
  ];
}

/**
 * The bold first sentence of the create dialog's note ("createNeedsSetup"), or null when the
 * template has no form or the site has what its form needs.
 */
export function setupGap(
  hasForm: boolean,
  siteName: string,
  site: TemplateSiteReadiness,
): string | null {
  if (!hasForm) {
    return null;
  }
  const noRecipients = site.confirmedRecipients === 0;
  const noConsent = site.consentGaps.length > 0;
  if (noRecipients && noConsent) {
    return `${siteName} chưa có nơi nhận lead và nội dung đồng ý.`;
  }
  if (noRecipients) {
    return `${siteName} chưa có nơi nhận lead.`;
  }
  return noConsent ? `${siteName} chưa có nội dung đồng ý.` : null;
}
