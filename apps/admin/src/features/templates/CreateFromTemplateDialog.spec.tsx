import { type Access, endpoints, type TemplateSiteReadiness } from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SITE_ID, siteFixture, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { CreateFromTemplateDialog } from './CreateFromTemplateDialog';
import { templateQueryKeys } from './queries';
import { readinessFixture, summaryFixture } from './test-fixtures';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const KITCHEN_ID = '64b000000000000000000002';
const NEW_PAGE_ID = '64b000000000000000000777';

const smile = siteFixture({ publicOrigin: 'https://go.smilecare.vn' });
const kitchen = siteFixture({
  id: KITCHEN_ID,
  name: 'Bếp Nhà Mây',
  subdomain: 'bepnhamay',
  publicOrigin: 'https://bepnhamay.payload.site',
});

const NOT_READY = readinessFixture({
  siteId: KITCHEN_ID,
  confirmedRecipients: 0,
  recipientEmail: null,
  consentVersion: null,
  consentGaps: ['privacy', 'consent'],
});

/** Slugs are free; each site answers its readiness; creating returns the new page. */
function serve(
  readiness: Record<string, TemplateSiteReadiness>,
  create: () => Promise<unknown> = () => Promise.resolve({ page: { id: NEW_PAGE_ID } }),
) {
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.slugAvailability) {
      const { slug } = (options as { query: { slug: string } }).query;
      return Promise.resolve({ slug, available: true, reason: null, message: null });
    }
    if (endpoint === endpoints.getTemplate) {
      const { siteId } = (options as { query: { siteId: string } }).query;
      return Promise.resolve({ site: readiness[siteId] ?? null });
    }
    if (endpoint === endpoints.createPage) {
      return create();
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

function renderDialog(
  options: { role?: Access; siteId?: string; onTemplateChanged?: () => void } = {},
) {
  return renderWithProviders(
    <CreateFromTemplateDialog
      workspaceId={WORKSPACE_ID}
      template={summaryFixture('nha-khoa-uu-dai')}
      sites={[smile, kitchen]}
      initialSiteId={options.siteId ?? SITE_ID}
      role={options.role ?? 'owner'}
      open
      onOpenChange={vi.fn()}
      onTemplateChanged={options.onTemplateChanged ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  router.push.mockReset();
});

describe('CreateFromTemplateDialog', () => {
  it('starts from the template’s name, its slug and the chosen site', async () => {
    serve({ [SITE_ID]: readinessFixture() });
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
    expect(dialog).toHaveAccessibleDescription(
      'Trang mới là bản nháp. Chưa ai thấy cho tới khi bạn xuất bản.',
    );
    expect(within(dialog).getByRole('combobox', { name: 'Site' })).toHaveValue(SITE_ID);
    expect(within(dialog).getByRole('textbox', { name: /Tên trang/ })).toHaveValue(
      'Ưu đãi dịch vụ nha khoa',
    );
    expect(within(dialog).getByRole('textbox', { name: /Đường dẫn/ })).toHaveValue(
      'uu-dai-dich-vu-nha-khoa',
    );
    expect(within(dialog).getByText('go.smilecare.vn/')).toBeInTheDocument();
    expect(await within(dialog).findByText('Đường dẫn này dùng được.')).toBeInTheDocument();
    // The site has what the form needs: no note.
    expect(within(dialog).queryByRole('note')).toBeNull();
  });

  it('notes what a site misses for the form, and links where to set it up (createNeedsSetup)', async () => {
    const user = userEvent.setup();
    serve({ [SITE_ID]: readinessFixture(), [KITCHEN_ID]: NOT_READY });
    renderDialog();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Site' }), KITCHEN_ID);

    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent(
      'Bếp Nhà Mây chưa có nơi nhận lead và nội dung đồng ý. Bạn vẫn tạo được bản nháp. Trước khi xuất bản, hãy thiết lập ở Dữ liệu & đồng ý và Nơi nhận lead; checklist xuất bản sẽ chặn nếu còn thiếu.',
    );
    expect(within(note).getByRole('link', { name: 'Dữ liệu & đồng ý' })).toHaveAttribute(
      'href',
      `/sites/${KITCHEN_ID}/privacy`,
    );
    expect(within(note).getByRole('link', { name: 'Nơi nhận lead' })).toHaveAttribute(
      'href',
      `/sites/${KITCHEN_ID}/leads?recipients=open`,
    );
    expect(screen.getByText('bepnhamay.payload.site/')).toBeInTheDocument();
    expect(lastCallTo(apiMock, endpoints.getTemplate)).toMatchObject({
      args: [WORKSPACE_ID, 'nha-khoa-uu-dai'],
      options: { query: { siteId: KITCHEN_ID } },
    });
  });

  it('names who sets the site up for a role that cannot', async () => {
    serve({ [KITCHEN_ID]: NOT_READY });
    renderDialog({ role: 'editor', siteId: KITCHEN_ID });
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('Chủ sở hữu và Quản trị cần thiết lập cho site;');
    expect(within(note).queryByRole('link')).toBeNull();
  });

  it('creates the draft from the version shown and opens the editor', async () => {
    const user = userEvent.setup();
    serve({ [SITE_ID]: readinessFixture() });
    renderDialog();
    const title = screen.getByRole('textbox', { name: /Tên trang/ });
    await user.clear(title);
    await user.type(title, 'Ưu đãi tẩy trắng');
    expect(screen.getByRole('textbox', { name: /Đường dẫn/ })).toHaveValue('uu-dai-tay-trang');
    await screen.findByText('Đường dẫn này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp và mở editor' }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${NEW_PAGE_ID}/edit`);
    });
    expect(lastCallTo(apiMock, endpoints.createPage)).toEqual({
      args: [SITE_ID],
      options: {
        body: {
          title: 'Ưu đãi tẩy trắng',
          slug: 'uu-dai-tay-trang',
          start: {
            kind: 'template',
            source: 'system',
            templateId: 'nha-khoa-uu-dai',
            version: 1,
          },
        },
      },
    });
  });

  it('shows the address another page took on its field', async () => {
    const user = userEvent.setup();
    serve({ [SITE_ID]: readinessFixture() }, () =>
      Promise.reject(
        apiError(409, 'slug_taken', 'Đường dẫn này đã được một trang khác trong site dùng'),
      ),
    );
    renderDialog();
    await screen.findByText('Đường dẫn này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp và mở editor' }));
    expect(
      await screen.findByText('Đường dẫn này đã được một trang khác trong site dùng'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Đường dẫn/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says what the form cannot show on a field', async () => {
    const user = userEvent.setup();
    serve({ [SITE_ID]: readinessFixture() }, () =>
      Promise.reject(
        apiError(422, 'validation_failed', 'Dữ liệu không hợp lệ', [
          { path: ['start', 'templateId'], code: 'custom', message: 'Mã mẫu không hợp lệ' },
        ]),
      ),
    );
    renderDialog();
    await screen.findByText('Đường dẫn này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp và mở editor' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mã mẫu không hợp lệ');
  });

  it('says the template was archived meanwhile, stops, and has the screen read it again', async () => {
    const user = userEvent.setup();
    const onTemplateChanged = vi.fn();
    serve({ [SITE_ID]: readinessFixture() }, () =>
      Promise.reject(
        apiError(409, 'template_archived', 'Mẫu “Ưu đãi dịch vụ nha khoa” đã được lưu trữ'),
      ),
    );
    const { queryClient } = renderDialog({ onTemplateChanged });
    queryClient.setQueryData(templateQueryKeys.all(WORKSPACE_ID), { items: [] });
    await screen.findByText('Đường dẫn này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp và mở editor' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mẫu “Ưu đãi dịch vụ nha khoa” đã được lưu trữ. Khôi phục mẫu ở “Template của workspace” để dùng lại.',
    );
    expect(screen.getByRole('button', { name: 'Tạo bản nháp và mở editor' })).toBeDisabled();
    expect(onTemplateChanged).toHaveBeenCalledOnce();
    expect(queryClient.getQueryState(templateQueryKeys.all(WORKSPACE_ID))?.isInvalidated).toBe(
      true,
    );
  });

  it('tells a role that cannot restore an archived template who can', async () => {
    const user = userEvent.setup();
    serve({ [SITE_ID]: readinessFixture() }, () =>
      Promise.reject(
        apiError(409, 'template_archived', 'Mẫu “Ưu đãi dịch vụ nha khoa” đã được lưu trữ'),
      ),
    );
    renderDialog({ role: 'contributor' });
    await screen.findByText('Đường dẫn này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp và mở editor' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chỉ Chủ sở hữu, Quản trị và Biên tập khôi phục được mẫu.');
    expect(alert).not.toHaveTextContent('Khôi phục mẫu');
  });

  it('offers the new version when the template changed since it was shown', async () => {
    const user = userEvent.setup();
    const onTemplateChanged = vi.fn();
    serve({ [SITE_ID]: readinessFixture() }, () =>
      Promise.reject(
        apiError(409, 'template_changed', 'Mẫu “Ưu đãi dịch vụ nha khoa” đã có phiên bản mới (v2)'),
      ),
    );
    renderDialog({ onTemplateChanged });
    await screen.findByText('Đường dẫn này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp và mở editor' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Mẫu “Ưu đãi dịch vụ nha khoa” đã có phiên bản mới (v2)');
    expect(screen.getByRole('button', { name: 'Tạo bản nháp và mở editor' })).toBeDisabled();
    await user.click(within(alert).getByRole('button', { name: 'Xem phiên bản mới' }));
    expect(onTemplateChanged).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
  });
});
