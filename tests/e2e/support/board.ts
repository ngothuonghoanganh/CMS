import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import {
  type Asset,
  assetSchema,
  type ColorSchemeId,
  type Composition,
  consentVersionSchema,
  type CreatePageRequest,
  dataRequestDetailSchema,
  type DataRequestType,
  endpoints,
  IDEMPOTENCY_KEY_HEADER,
  leadDetailSchema,
  leadListResponseSchema,
  type LeadStatus,
  pageDetailResponseSchema,
  type PageDetailResponse,
  pointerMoveResponseSchema,
  publishResponseSchema,
  type PublishResponse,
  saveDraftResponseSchema,
  type SectionInstance,
  type Site,
  siteSchema,
  SUGGESTED_MARKETING_CONSENT_TEXT,
  type ThemePresetId,
} from '@plp/contracts';
import { siteOrigin, urls } from '../urls.js';
import { clinicImage } from './fixtures.js';
import {
  type Account,
  call,
  configurePrivacyViaApi,
  confirmRecipientViaApi,
  createPageViaApi,
  createSiteViaApi,
  newAccount,
  newSubdomain,
  signUpViaApi,
} from './setup.js';
import { VISITOR_UA } from './visitor.js';

/*
 * Board-like data: the sample workspace of the design ("Mây Xanh Agency", site "Nha khoa Smile
 * Care", owner "Ngọc Anh"), seeded through the API as people would create it. The accessibility
 * scans and the design capture tool (`pnpm --filter @plp/e2e visual:capture`) read the screens
 * with this data, so every screen shows the states its board draws.
 */

/** A phone browser people use, so leads and views count as "Điện thoại". */
export const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

/** Section ids as the editor makes them. */
function sectionId(): string {
  return randomBytes(6).toString('hex');
}

export function getPageViaApi(
  request: APIRequestContext,
  pageId: string,
): Promise<PageDetailResponse> {
  return call(request, 'GET', endpoints.getPage.path(pageId), pageDetailResponseSchema);
}

/** Autosaves a draft changed by `change`, as the editor does (ADR-005). */
export async function saveDraftViaApi(
  request: APIRequestContext,
  pageId: string,
  change: (draft: PageDetailResponse['draft']) => Partial<{
    composition: Composition;
    slug: string;
    seo: PageDetailResponse['draft']['seo'];
  }>,
): Promise<void> {
  const { draft } = await getPageViaApi(request, pageId);
  const changed = change(draft);
  await call(request, 'PUT', endpoints.saveDraft.path(pageId), saveDraftResponseSchema, {
    baseRevision: draft.revision,
    slug: changed.slug ?? draft.slug,
    composition: changed.composition ?? draft.composition,
    seo: changed.seo ?? draft.seo,
  });
}

/** Publishes the draft as the publish dialog does when every warning is skipped. */
export async function publishViaApi(
  request: APIRequestContext,
  pageId: string,
  note = '',
): Promise<PublishResponse> {
  const { page, checks } = await getPageViaApi(request, pageId);
  if (checks.blocking.length > 0) {
    throw new Error(`Page ${pageId} cannot be published: ${checks.blocking[0]?.title ?? ''}`);
  }
  return call(
    request,
    'POST',
    endpoints.publish.path(pageId),
    publishResponseSchema,
    {
      expectedRevision: checks.revision,
      expectedPublishedReleaseId: page.liveRelease?.id ?? null,
      acknowledgedWarnings: checks.warnings.map((warning) => warning.fingerprint),
      acknowledgedSiteChanges: page.siteChanges.map((change) => change.label),
      note,
    },
    { [IDEMPOTENCY_KEY_HEADER]: randomBytes(12).toString('hex') },
  );
}

/** Rollback (`target` = an older release) or unpublish (`target` = null), with a reason. */
export async function movePointerViaApi(
  request: APIRequestContext,
  pageId: string,
  target: string | null,
  reason: string,
): Promise<void> {
  const { page } = await getPageViaApi(request, pageId);
  await call(request, 'POST', endpoints.movePointer.path(pageId), pointerMoveResponseSchema, {
    targetReleaseId: target,
    expectedCurrentReleaseId: page.liveRelease?.id ?? null,
    reason,
  });
}

export function setThemeViaApi(
  request: APIRequestContext,
  siteId: string,
  themePresetId: ThemePresetId,
): Promise<Site> {
  return call(request, 'PATCH', endpoints.updateSite.path(siteId), siteSchema, { themePresetId });
}

/** Uploads the small clinic photo with a default description (ADR-012). */
export async function uploadImageViaApi(
  request: APIRequestContext,
  siteId: string,
  alt: string,
): Promise<Asset> {
  const response = await request.post(`${urls.admin}/api${endpoints.uploadAsset.path(siteId)}`, {
    headers: { origin: urls.admin },
    multipart: { file: clinicImage, alt, decorative: 'false' },
  });
  if (!response.ok()) {
    throw new Error(`Upload answered ${response.status()}: ${await response.text()}`);
  }
  return assetSchema.parse(await response.json());
}

export interface BoardLead {
  name: string;
  phone: string;
  /** Slug of the live page whose form the lead was sent from. */
  slug: string;
  source: { utmSource: string | null; utmMedium: string | null; referrer: string | null };
  phoneDevice: boolean;
  status: LeadStatus;
  email?: string;
  message?: string;
  spam?: boolean;
}

/**
 * A visitor's lead as the page script sends it to the renderer (`POST /_lead`, ADR-016), filled in
 * 20 seconds. Returns nothing: the renderer answers `{ ok: true }` once the API has it.
 */
export async function sendLeadViaRenderer(
  request: APIRequestContext,
  subdomain: string,
  releaseId: string,
  lead: BoardLead,
): Promise<void> {
  const response = await request.post(`${siteOrigin(subdomain)}/_lead`, {
    headers: { 'user-agent': lead.phoneDevice ? PHONE_UA : VISITOR_UA },
    data: {
      releaseId,
      submissionId: randomBytes(12).toString('hex'),
      name: lead.name,
      phone: lead.phone,
      email: lead.email ?? '',
      message: lead.message ?? '',
      consent: true,
      marketing: false,
      honeypot: lead.spam === true ? 'https://spam.example' : '',
      elapsedMs: 20_000,
      source: { ...lead.source, utmCampaign: null },
    },
  });
  if (response.status() !== 200) {
    throw new Error(`Lead of ${lead.name} answered ${response.status()}: ${await response.text()}`);
  }
}

/** A view as the live page's script sends it (`POST /_e`, ADR-019); the renderer answers 204. */
export async function sendViewViaRenderer(
  request: APIRequestContext,
  subdomain: string,
  path: string,
  visitor: { userAgent: string; utmSource: string | null; utmMedium: string | null },
): Promise<void> {
  const response = await request.post(`${siteOrigin(subdomain)}/_e`, {
    headers: { 'user-agent': visitor.userAgent, 'content-type': 'text/plain;charset=UTF-8' },
    data: JSON.stringify({
      path,
      source: {
        utmSource: visitor.utmSource,
        utmMedium: visitor.utmMedium,
        utmCampaign: null,
        referrer: null,
      },
    }),
  });
  if (response.status() !== 204) {
    throw new Error(`View of ${path} answered ${response.status()}`);
  }
}

/** The pages of the board "01 · Bảng điều khiển", one per state. */
export const BOARD_PAGES = {
  promo: { title: 'Ưu đãi niềng răng tháng 11', slug: 'uu-dai-thang-11' },
  home: { title: 'Trang chủ', slug: '' },
  implant: { title: 'Cấy ghép Implant', slug: 'implant' },
  webinar: { title: 'Webinar chăm sóc răng trẻ em', slug: 'webinar-tre-em' },
  thuDuc: { title: 'Khai trương chi nhánh Thủ Đức', slug: 'thu-duc' },
  triAn: { title: 'Tri ân khách hàng 2025', slug: 'tri-an-2025' },
} as const;

export type BoardPageKey = keyof typeof BOARD_PAGES;

/** The leads of the board "10 · Hộp thư lead", newest last (they are sent in this order). */
const BOARD_LEADS: BoardLead[] = [
  {
    name: 'Hoàng Thảo Vy',
    phone: '0396 004 517',
    email: 'thaovy.h@gmail.com',
    slug: 'implant',
    source: { utmSource: null, utmMedium: null, referrer: 'https://www.google.com/' },
    phoneDevice: false,
    status: 'contacted',
  },
  {
    name: 'Đặng Minh Khoa',
    phone: '0905 771 302',
    slug: 'uu-dai-thang-11',
    source: { utmSource: 'facebook', utmMedium: 'cpc', referrer: null },
    phoneDevice: true,
    status: 'scheduled',
  },
  {
    name: 'Võ Ngọc Trâm',
    phone: '0703 285 664',
    slug: '',
    source: { utmSource: 'tiktok', utmMedium: 'paid', referrer: null },
    phoneDevice: true,
    status: 'unreachable',
  },
  {
    name: 'Phạm Gia Huy',
    phone: '0912 448 019',
    slug: 'uu-dai-thang-11',
    source: { utmSource: 'zalo', utmMedium: 'oa', referrer: null },
    phoneDevice: true,
    status: 'scheduled',
  },
  {
    name: 'Lê Mai Anh',
    phone: '0987 106 223',
    slug: 'implant',
    source: { utmSource: null, utmMedium: null, referrer: null },
    phoneDevice: false,
    status: 'contacted',
  },
  {
    name: 'Bot quảng cáo',
    phone: '0911 111 111',
    slug: 'uu-dai-thang-11',
    source: { utmSource: null, utmMedium: null, referrer: null },
    phoneDevice: false,
    status: 'new',
    spam: true,
  },
  {
    name: 'Trần Quốc Bảo',
    phone: '0938 512 840',
    slug: 'uu-dai-thang-11',
    source: { utmSource: 'google', utmMedium: 'cpc', referrer: null },
    phoneDevice: false,
    status: 'new',
  },
  {
    name: 'Nguyễn Thu Hà',
    phone: '0901 234 567',
    message: 'Tôi muốn hỏi giá niềng răng trong suốt cho người đi làm.',
    slug: 'uu-dai-thang-11',
    source: { utmSource: 'facebook', utmMedium: 'cpc', referrer: null },
    phoneDevice: true,
    status: 'new',
  },
];

/** Visitors per page and source for "11 · Hiệu quả": [slug, source, medium, phones, desktops]. */
const BOARD_VIEWS: Array<[string, string | null, string | null, number, number]> = [
  ['uu-dai-thang-11', 'facebook', 'cpc', 9, 2],
  ['uu-dai-thang-11', 'google', 'cpc', 3, 2],
  ['', null, null, 3, 2],
  ['', 'zalo', 'oa', 2, 0],
  ['implant', 'tiktok', 'paid', 2, 0],
  ['implant', null, null, 1, 1],
];

export interface Board {
  account: Account;
  site: Site;
  pages: Record<BoardPageKey, PageDetailResponse['page']>;
  /** Lead ids by name. */
  leads: Map<string, string>;
}

function goalPage(
  key: BoardPageKey,
  goal: Extract<CreatePageRequest['start'], { kind: 'goal' }>['goal'],
  offer: string,
): CreatePageRequest {
  return {
    title: BOARD_PAGES[key].title,
    slug: BOARD_PAGES[key].slug,
    start: {
      kind: 'goal',
      goal,
      brief: { offer, audience: 'Người đi làm 25–40 tuổi', phone: '0901 234 567' },
      style: 'calm',
    },
  };
}

function withSection(
  composition: Composition,
  type: SectionInstance['type'],
  change: (section: SectionInstance) => SectionInstance,
): Composition {
  return {
    ...composition,
    sections: composition.sections.map((section) =>
      section.type === type ? change(section) : section,
    ),
  };
}

/**
 * Seeds the board's workspace through the API with the owner's session in `request` (a context
 * of its own: it signs a new owner up). Every run makes new names where they must be unique: the
 * account email and the subdomain.
 */
export async function seedBoard(request: APIRequestContext): Promise<Board> {
  const account = newAccount('Ngọc Anh', 'Mây Xanh Agency');
  const me = await signUpViaApi(request, account);
  const workspace = me.memberships[0]?.workspace;
  if (workspace === undefined) {
    throw new Error(`Sign-up of ${account.email} returned no workspace`);
  }
  const site = await createSiteViaApi(request, workspace.id, {
    name: 'Nha khoa Smile Care',
    subdomain: newSubdomain('smilecare'),
  });

  // Personal data settings with consent text "bản 2", and two confirmed addresses (ADR-017/018).
  await configurePrivacyViaApi(request, site.id);
  await call(request, 'POST', endpoints.createConsentVersion.path(site.id), consentVersionSchema, {
    baseVersion: 1,
    requiredText:
      'Tôi đồng ý để {Tên doanh nghiệp} xử lý họ tên và số điện thoại của tôi nhằm liên hệ tư vấn dịch vụ.',
    marketingText: SUGGESTED_MARKETING_CONSENT_TEXT,
  });
  await confirmRecipientViaApi(request, site.id);
  await confirmRecipientViaApi(request, site.id);

  const logo = await uploadImageViaApi(request, site.id, 'Logo Nha khoa Smile Care');
  const share = await uploadImageViaApi(request, site.id, 'Nha khoa Smile Care');
  await call(request, 'PATCH', endpoints.updateSite.path(site.id), siteSchema, {
    logoAssetId: logo.id,
    defaultShareImageAssetId: share.id,
  });
  const doctor = await uploadImageViaApi(request, site.id, 'Bác sĩ tư vấn cho khách hàng');

  const offer = 'Niềng răng trong suốt, tư vấn miễn phí cùng bác sĩ';
  const created = {
    promo: await createPageViaApi(request, site.id, goalPage('promo', 'promo', offer)),
    home: await createPageViaApi(
      request,
      site.id,
      goalPage('home', 'lead', 'Nha khoa gia đình tại TP. Thủ Đức'),
    ),
    implant: await createPageViaApi(
      request,
      site.id,
      goalPage('implant', 'lead', 'Cấy ghép Implant bảo hành 10 năm'),
    ),
    webinar: await createPageViaApi(
      request,
      site.id,
      goalPage('webinar', 'event', 'Webinar chăm sóc răng trẻ em'),
    ),
    thuDuc: await createPageViaApi(
      request,
      site.id,
      goalPage('thuDuc', 'promo', 'Khai trương chi nhánh Thủ Đức'),
    ),
    triAn: await createPageViaApi(
      request,
      site.id,
      goalPage('triAn', 'about', 'Tri ân khách hàng 2025'),
    ),
  };
  const pageId = (key: BoardPageKey) => created[key].page.id;

  // "Tri ân khách hàng 2025": published, then taken down.
  await publishViaApi(request, pageId('triAn'), 'Chương trình tri ân');
  await movePointerViaApi(request, pageId('triAn'), null, 'Hết chương trình');

  // "Cấy ghép Implant": v2 went live, then the owner went back to v1.
  const implantV1 = await publishViaApi(request, pageId('implant'), 'Bản đầu tiên');
  await saveDraftViaApi(request, pageId('implant'), (draft) => ({
    composition: withSection(draft.composition, 'hero', (hero) => ({
      ...hero,
      content: { ...hero.content, heading: 'Cấy ghép Implant — giá mới từ 15 triệu' },
    })),
  }));
  await publishViaApi(request, pageId('implant'), 'Bảng giá mới');
  await movePointerViaApi(request, pageId('implant'), implantV1.release.id, 'Bảng giá v2 sai');

  await publishViaApi(request, pageId('home'), 'Trang chủ mới');

  // "Ưu đãi niềng răng tháng 11": three versions, then a draft with 4 changes, a blocking error
  // (the second Hero button leads nowhere) and a photo without description.
  await publishViaApi(request, pageId('promo'), 'Ưu đãi tháng 11');
  await saveDraftViaApi(request, pageId('promo'), (draft) => ({
    composition: withSection(draft.composition, 'faq', (faq) => ({
      ...faq,
      content: { ...faq.content, heading: 'Câu hỏi thường gặp về niềng răng' },
    })),
  }));
  await publishViaApi(request, pageId('promo'), 'Thêm câu hỏi thường gặp');
  await saveDraftViaApi(request, pageId('promo'), (draft) => {
    const faqId = draft.composition.sections.find((section) => section.type === 'faq')?.id ?? '';
    return {
      composition: withSection(draft.composition, 'hero', (hero) => ({
        ...hero,
        variant: 'split',
        content: {
          ...hero.content,
          eyebrow: 'Ưu đãi tháng 11',
          subheading:
            'Bác sĩ đánh giá khớp cắn và lên kế hoạch niềng phù hợp với bạn. Buổi tư vấn đầu tiên không mất phí.',
          secondaryCta: { label: 'Xem bảng giá', link: { kind: 'section', sectionId: faqId } },
          image: { assetId: doctor.id, alt: 'Bác sĩ tư vấn cho khách hàng', decorative: false },
        },
      })),
    };
  });
  await publishViaApi(request, pageId('promo'), 'Cập nhật giá ưu đãi tháng 11');
  await saveDraftViaApi(request, pageId('promo'), (draft) => {
    let composition = withSection(draft.composition, 'hero', (hero) => ({
      ...hero,
      content: {
        ...hero.content,
        secondaryCta: { label: 'Xem bảng giá', link: { kind: 'url', url: '' } },
        image: { assetId: doctor.id, alt: '', decorative: false },
      },
    }));
    composition = withSection(composition, 'testimonials', (section) => ({
      ...section,
      visibility: { desktop: true, mobile: false },
    }));
    return {
      composition,
      seo: {
        ...draft.seo,
        title: 'Niềng răng trong suốt – Tư vấn miễn phí | Smile Care',
        description:
          'Đặt lịch tư vấn niềng răng trong suốt miễn phí cùng bác sĩ Smile Care. Ưu đãi áp dụng trong tháng 11.',
      },
    };
  });

  // Every lead comes from a live page's form, in the board's order (newest last).
  const live = new Map<string, string>();
  for (const key of ['promo', 'home', 'implant'] as const) {
    const { page } = await getPageViaApi(request, pageId(key));
    if (page.liveRelease === null) {
      throw new Error(`${page.title} is not live`);
    }
    live.set(BOARD_PAGES[key].slug, page.liveRelease.id);
  }
  for (const lead of BOARD_LEADS) {
    const releaseId = live.get(lead.slug);
    if (releaseId === undefined) {
      throw new Error(`No live page at /${lead.slug}`);
    }
    await sendLeadViaRenderer(request, site.subdomain, releaseId, lead);
  }
  const listed = await call(
    request,
    'GET',
    `${endpoints.listLeads.path(site.id)}?range=all`,
    leadListResponseSchema,
  );
  const spamListed = await call(
    request,
    'GET',
    `${endpoints.listLeads.path(site.id)}?range=all&folder=spam`,
    leadListResponseSchema,
  );
  const leads = new Map(
    [...listed.items, ...spamListed.items].map((item) => [item.name, item.id] as const),
  );
  for (const lead of BOARD_LEADS) {
    const id = leads.get(lead.name);
    if (id === undefined) {
      throw new Error(`Lead of ${lead.name} was not received`);
    }
    if (lead.status !== 'new') {
      await call(request, 'PATCH', endpoints.updateLead.path(id), leadDetailSchema, {
        status: lead.status,
      });
    }
  }

  // Views of today: each visitor is a browser of its own (ADR-019 counts unique visitors by user
  // agent when the renderer knows no address).
  let visitor = 0;
  for (const [slug, utmSource, utmMedium, phones, desktops] of BOARD_VIEWS) {
    for (let index = 0; index < phones + desktops; index += 1) {
      visitor += 1;
      const userAgent = `${index < phones ? PHONE_UA : VISITOR_UA} Visitor/${visitor}`;
      await sendViewViaRenderer(request, site.subdomain, `/${slug}`, {
        userAgent,
        utmSource,
        utmMedium,
      });
    }
  }

  // "Yêu cầu từ người gửi form": one open, one completed, one answered.
  const now = Date.now();
  const recorded = async (
    type: DataRequestType,
    contact: { name: string; phone: string; email: string },
    hoursAgo: number,
  ) =>
    call(request, 'POST', endpoints.createDataRequest.path(site.id), dataRequestDetailSchema, {
      ...contact,
      type,
      receivedAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
    });
  const access = await recorded('access', { name: '', phone: '', email: 'thaovy.h@gmail.com' }, 72);
  await call(
    request,
    'POST',
    endpoints.respondDataRequest.path(access.id),
    dataRequestDetailSchema,
  );
  const withdraw = await recorded(
    'withdraw_marketing',
    { name: 'Phạm Gia Huy', phone: '0912 448 019', email: '' },
    48,
  );
  await call(
    request,
    'POST',
    endpoints.completeDataRequest.path(withdraw.id),
    dataRequestDetailSchema,
  );
  await recorded('delete', { name: 'Lê Mai Anh', phone: '0987 106 223', email: '' }, 20);

  const pages = Object.fromEntries(
    await Promise.all(
      (Object.keys(BOARD_PAGES) as BoardPageKey[]).map(
        async (key) => [key, (await getPageViaApi(request, pageId(key))).page] as const,
      ),
    ),
  ) as Record<BoardPageKey, PageDetailResponse['page']>;
  return { account, site, pages, leads };
}

/**
 * A page that shows every section and variant in one color scheme: the sections of a "Thu lead"
 * page plus the other variants (Hero "Căn giữa" and "Ảnh nền", Lợi ích "Xen kẽ", Cảm nhận "Trích
 * dẫn nổi bật") and a call-to-action band.
 */
export async function createSchemePageViaApi(
  request: APIRequestContext,
  siteId: string,
  scheme: ColorSchemeId,
  image: Asset,
): Promise<string> {
  const slug = `bang-mau-${scheme}`;
  const lead = await createPageViaApi(request, siteId, {
    title: `Bảng màu ${scheme}`,
    slug,
    start: {
      kind: 'goal',
      goal: 'lead',
      brief: { offer: 'Niềng răng trong suốt', audience: '', phone: '0901 234 567' },
      style: 'calm',
    },
  });
  const product = await createPageViaApi(request, siteId, {
    title: `Mẫu dải kêu gọi ${scheme}`,
    slug: `mau-dai-${scheme}`,
    start: {
      kind: 'goal',
      goal: 'product',
      brief: { offer: 'Tẩy trắng răng', audience: '', phone: '0901 234 567' },
      style: 'calm',
    },
  });
  const ctaBand = product.draft.composition.sections.find((section) => section.type === 'cta_band');
  if (ctaBand === undefined) {
    throw new Error('A product page has no call-to-action band');
  }
  const picture = { assetId: image.id, alt: image.alt ?? '', decorative: false };
  const sections: SectionInstance[] = [];
  for (const section of lead.draft.composition.sections) {
    const copy = { ...section, content: { ...section.content } };
    if (section.type === 'hero') {
      copy.content['image'] = picture;
    }
    if (section.type === 'footer') {
      sections.push(
        { ...ctaBand, id: sectionId() },
        ...variantsOf(lead.draft.composition, picture),
      );
    }
    sections.push(copy);
  }
  await saveDraftViaApi(request, lead.page.id, () => ({
    composition: {
      version: 1,
      sections: sections.map((section) => ({ ...section, colorScheme: scheme })),
    },
  }));
  return lead.page.id;
}

/** The variants a "Thu lead" page does not use, made from its own sections. */
function variantsOf(
  composition: Composition,
  picture: { assetId: string; alt: string; decorative: boolean },
): SectionInstance[] {
  const of = (type: SectionInstance['type']) => {
    const section = composition.sections.find((candidate) => candidate.type === type);
    if (section === undefined) {
      throw new Error(`A "Thu lead" page has no ${type}`);
    }
    return section;
  };
  const hero = of('hero');
  const benefits = of('benefits');
  const testimonials = of('testimonials');
  return [
    { ...hero, id: sectionId(), variant: 'centered' },
    {
      ...hero,
      id: sectionId(),
      variant: 'background',
      content: { ...hero.content, image: picture },
    },
    {
      ...benefits,
      id: sectionId(),
      variant: 'alternate',
      content: {
        ...benefits.content,
        items: (benefits.content['items'] as Array<Record<string, unknown>>).map((item) => ({
          ...item,
          image: picture,
        })),
      },
    },
    { ...testimonials, id: sectionId(), variant: 'quote' },
  ];
}
