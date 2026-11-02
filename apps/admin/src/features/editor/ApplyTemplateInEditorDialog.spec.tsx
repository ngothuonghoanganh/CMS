import { endpoints } from '@plp/contracts';
import { buildCompositionFromTemplate, findSystemTemplate } from '@plp/sections/schema';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../lib/api';
import { templateSummaries, workspaceSummaryFixture } from '../templates/test-fixtures';
import { ApplyTemplateInEditorDialog } from './ApplyTemplateInEditorDialog';
import { asset, makeStore, PAGE_ID, SITE_ID, sectionIds } from './test-fixtures';
import { renderEditor } from './test-render';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function dentalComposition() {
  const template = findSystemTemplate('nha-khoa-uu-dai');
  if (!template) {
    throw new Error('No system template "nha-khoa-uu-dai"');
  }
  let next = 0;
  return buildCompositionFromTemplate(template, () => {
    next += 1;
    return `server${String(next).padStart(6, '0')}`;
  });
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('ApplyTemplateInEditorDialog ("Áp dụng mẫu…", ADR-030)', () => {
  it('applies a template of the library as one undo step, with its images', async () => {
    const user = userEvent.setup();
    const limited = workspaceSummaryFixture({
      id: '64b0000000000000000000f9',
      name: 'Chỉ cho site khác',
      siteIds: ['64b0000000000000000000ee'],
    });
    const own = workspaceSummaryFixture();
    const image = { ...asset, id: '64b0000000000000000000ab' };
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.listTemplates) {
        return Promise.resolve({ items: [...templateSummaries, own, limited] });
      }
      if (endpoint === endpoints.templateComposition) {
        return Promise.resolve({
          composition: dentalComposition(),
          assets: [image],
          template: { name: 'Ưu đãi dịch vụ nha khoa', version: 1 },
        });
      }
      return Promise.reject(new Error('unexpected call'));
    });
    const store = makeStore();
    const before = store.getState().draft;
    const onOpenChange = vi.fn();
    renderEditor(<ApplyTemplateInEditorDialog open onOpenChange={onOpenChange} />, { store });

    const dialog = screen.getByRole('dialog', { name: 'Áp dụng mẫu' });
    const picker = await within(dialog).findByRole('combobox', { name: 'Mẫu' });
    // System templates and the workspace's own this site may use; never one limited elsewhere.
    expect(within(picker).getByRole('group', { name: 'Của workspace' })).toHaveTextContent(
      'Tư vấn niềng răng trả góp · v2',
    );
    expect(within(picker).queryByRole('option', { name: /Chỉ cho site khác/ })).toBeNull();
    expect(
      within(dialog).getByText(
        '5 section hiện có trong bản nháp được thay bằng 8 section của mẫu.',
      ),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng mẫu' }));
    expect(apiMock).toHaveBeenCalledWith(endpoints.templateComposition, [SITE_ID, PAGE_ID], {
      body: { source: 'system', templateId: 'nha-khoa-uu-dai', version: 1 },
    });
    await vi.waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(store.getState().draft.composition.sections).toHaveLength(8);
    // Fresh ids from the store, never the server's.
    expect(sectionIds(store).some((id) => id.startsWith('server'))).toBe(false);
    expect(store.getState().assetsById[image.id]).toEqual(image);
    expect(store.getState().history.past).toHaveLength(1);
    expect(
      await screen.findByText('Đã áp dụng mẫu “Ưu đãi dịch vụ nha khoa”. Nhấn Ctrl+Z để hoàn tác.'),
    ).toBeInTheDocument();

    store.getState().undo();
    expect(store.getState().draft).toEqual(before);
  });

  it('cannot be dismissed while the template is prepared, so it never applies unseen', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => undefined;
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.listTemplates) {
        return Promise.resolve({ items: templateSummaries });
      }
      if (endpoint === endpoints.templateComposition) {
        return new Promise((resolve) => {
          answer = resolve;
        });
      }
      return Promise.reject(new Error('unexpected call'));
    });
    const store = makeStore();
    const onOpenChange = vi.fn();
    renderEditor(<ApplyTemplateInEditorDialog open onOpenChange={onOpenChange} />, { store });
    const dialog = screen.getByRole('dialog', { name: 'Áp dụng mẫu' });
    await within(dialog).findByRole('combobox', { name: 'Mẫu' });
    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng mẫu' }));

    // Escape and the close button are refused while the answer is on its way.
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeDisabled();

    answer({
      composition: dentalComposition(),
      assets: [],
      template: { name: 'Ưu đãi dịch vụ nha khoa', version: 1 },
    });
    await vi.waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(store.getState().draft.composition.sections).toHaveLength(8);
  });

  it('reads the library again when the template was archived meanwhile, and changes nothing', async () => {
    const user = userEvent.setup();
    const own = workspaceSummaryFixture();
    let archived = false;
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.listTemplates) {
        return Promise.resolve({
          items: archived ? templateSummaries : [own, ...templateSummaries],
        });
      }
      archived = true;
      return Promise.reject(
        new ApiError(409, {
          type: 'about:blank',
          title: `Mẫu “${own.name}” đã được lưu trữ`,
          status: 409,
          code: 'template_archived',
          detail: 'Khôi phục mẫu ở “Template của workspace” để dùng lại.',
        }),
      );
    });
    const store = makeStore();
    const before = store.getState().draft;
    renderEditor(<ApplyTemplateInEditorDialog open onOpenChange={vi.fn()} />, { store });
    const dialog = screen.getByRole('dialog', { name: 'Áp dụng mẫu' });
    const picker = await within(dialog).findByRole('combobox', { name: 'Mẫu' });
    await user.selectOptions(picker, own.id);
    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng mẫu' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      `Mẫu “${own.name}” đã được lưu trữ. Đã tải lại danh sách mẫu; hãy chọn mẫu khác.`,
    );
    await vi.waitFor(() => {
      expect(within(picker).queryByRole('option', { name: /Tư vấn niềng răng/ })).toBeNull();
    });
    // Nothing else is chosen in its place behind the user's back.
    expect(within(dialog).getByRole('button', { name: 'Áp dụng mẫu' })).toBeDisabled();
    expect(store.getState().draft).toBe(before);
    await user.selectOptions(picker, 'nha-khoa-uu-dai');
    expect(within(dialog).getByRole('button', { name: 'Áp dụng mẫu' })).toBeEnabled();
  });

  it('says when the template changed meanwhile, and changes nothing', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.listTemplates) {
        return Promise.resolve({ items: templateSummaries });
      }
      return Promise.reject(
        new ApiError(409, {
          type: 'about:blank',
          title: 'Mẫu “Ưu đãi dịch vụ nha khoa” đã có phiên bản mới (v2)',
          status: 409,
          code: 'template_changed',
          detail: 'Xem lại bản xem trước của phiên bản mới rồi thử lại.',
        }),
      );
    });
    const store = makeStore();
    const before = store.getState().draft;
    renderEditor(<ApplyTemplateInEditorDialog open onOpenChange={vi.fn()} />, { store });
    const dialog = screen.getByRole('dialog', { name: 'Áp dụng mẫu' });
    await within(dialog).findByRole('combobox', { name: 'Mẫu' });
    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng mẫu' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Mẫu “Ưu đãi dịch vụ nha khoa” đã có phiên bản mới (v2)',
    );
    expect(store.getState().draft).toBe(before);
  });
});
