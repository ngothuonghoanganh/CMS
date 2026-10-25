import type { Asset, AssetListResponse } from '@plp/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { api, uploadAsset } from '../../lib/api';
import type * as ApiModule from '../../lib/api';
import { asset, SITE_ID } from '../editor/test-fixtures';
import { AssetPickerDialog, type AssetSelection } from './AssetPickerDialog';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: vi.fn(), uploadAsset: vi.fn() };
});

const listMock = vi.mocked(api) as unknown as Mock<() => Promise<AssetListResponse>>;
const uploadMock = vi.mocked(uploadAsset);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function imageFile(name: string, type: string, size?: number): File {
  const file = new File(['image-bytes'], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

function setup() {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AssetPickerDialog open onOpenChange={onOpenChange} siteId={SITE_ID} onSelect={onSelect} />,
    { wrapper },
  );
  return { onSelect, onOpenChange, user: userEvent.setup({ applyAccept: false }) };
}

/** An image field: the picker stays mounted between openings, as in the editor and SEO page. */
function ImageField({ onSelect }: { onSelect: (selection: AssetSelection) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Thay ảnh
      </button>
      <AssetPickerDialog open={open} onOpenChange={setOpen} siteId={SITE_ID} onSelect={onSelect} />
    </>
  );
}

beforeEach(() => {
  listMock.mockReset();
  uploadMock.mockReset();
  listMock.mockResolvedValue({ items: [asset], nextCursor: null });
});

describe('AssetPickerDialog', () => {
  it('rejects files that are not supported images before uploading', async () => {
    const { user } = setup();
    await user.upload(screen.getByLabelText('Tệp ảnh'), imageFile('ghi-chu.txt', 'text/plain'));
    expect(screen.getByText('Chỉ nhận ảnh JPG, PNG, WebP, AVIF hoặc GIF.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Tệp ảnh'), imageFile('logo.svg', 'image/svg+xml'));
    expect(screen.getByText('Chỉ nhận ảnh JPG, PNG, WebP, AVIF hoặc GIF.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tải lên và chọn' }));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects images over 10 MB', async () => {
    const { user } = setup();
    await user.upload(
      screen.getByLabelText('Tệp ảnh'),
      imageFile('lon.png', 'image/png', 10 * 1024 * 1024 + 1),
    );
    expect(screen.getByText(/Ảnh lớn hơn 10 MB/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tải lên và chọn' }));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('requires a description or the decorative flag, then uploads and selects the image', async () => {
    const { user, onSelect, onOpenChange } = setup();
    const file = imageFile('bac-si.jpg', 'image/jpeg');
    await user.upload(screen.getByLabelText('Tệp ảnh'), file);
    await user.click(screen.getByRole('button', { name: 'Tải lên và chọn' }));
    expect(
      screen.getByText('Nhập mô tả ảnh hoặc đánh dấu "Ảnh chỉ để trang trí"'),
    ).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();

    const uploaded: Asset = { ...asset, id: '64b0000000000000000000aa', alt: 'Bác sĩ tư vấn' };
    uploadMock.mockResolvedValue(uploaded);
    await user.type(
      screen.getByLabelText(/^Mô tả ảnh cho người dùng trình đọc màn hình/),
      '  Bác sĩ tư vấn ',
    );
    await user.click(screen.getByRole('button', { name: 'Tải lên và chọn' }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    expect(uploadMock).toHaveBeenCalledWith(SITE_ID, file, {
      alt: 'Bác sĩ tư vấn',
      decorative: false,
    });
    expect(onSelect).toHaveBeenCalledWith(
      { assetId: uploaded.id, alt: 'Bác sĩ tư vấn', decorative: false },
      uploaded,
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uploads a decorative image without a description', async () => {
    const { user } = setup();
    uploadMock.mockResolvedValue({ ...asset, alt: null, decorative: true });
    const file = imageFile('hoa-van.png', 'image/png');
    await user.upload(screen.getByLabelText('Tệp ảnh'), file);
    await user.click(screen.getByLabelText('Ảnh chỉ để trang trí'));
    await user.click(screen.getByRole('button', { name: 'Tải lên và chọn' }));
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledWith(SITE_ID, file, { alt: '', decorative: true });
    });
  });

  it('picks an existing asset and copies its description', async () => {
    const { user, onSelect } = setup();
    const library = within(await screen.findByRole('list'));
    const tile = library.getByRole('button', { name: /Bác sĩ tư vấn cho khách hàng/ });
    expect(screen.getByRole('button', { name: 'Chọn ảnh' })).toBeDisabled();
    await user.click(tile);
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Chọn ảnh' }));
    expect(onSelect).toHaveBeenCalledWith(
      { assetId: asset.id, alt: 'Bác sĩ tư vấn cho khách hàng', decorative: false },
      asset,
    );
  });

  it.each(['Hủy', 'Đóng', 'Escape'])(
    'forgets the highlighted image when closed with %s',
    async (way) => {
      const onSelect = vi.fn();
      render(<ImageField onSelect={onSelect} />, { wrapper });
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Thay ảnh' }));
      const tile = await screen.findByRole('button', { name: /Bác sĩ tư vấn cho khách hàng/ });
      await user.click(tile);
      expect(tile).toHaveAttribute('aria-pressed', 'true');

      if (way === 'Escape') {
        await user.keyboard('{Escape}');
      } else {
        await user.click(screen.getByRole('button', { name: way }));
      }
      expect(screen.queryByRole('dialog')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Thay ảnh' }));
      expect(
        await screen.findByRole('button', { name: /Bác sĩ tư vấn cho khách hàng/ }),
      ).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Chọn ảnh' })).toBeDisabled();
      expect(onSelect).not.toHaveBeenCalled();
    },
  );

  it('forgets the image it chose, so reopening starts with nothing highlighted', async () => {
    const onSelect = vi.fn();
    render(<ImageField onSelect={onSelect} />, { wrapper });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Thay ảnh' }));
    await user.click(await screen.findByRole('button', { name: /Bác sĩ tư vấn cho khách hàng/ }));
    await user.click(screen.getByRole('button', { name: 'Chọn ảnh' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Thay ảnh' }));
    expect(
      await screen.findByRole('button', { name: /Bác sĩ tư vấn cho khách hàng/ }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Chọn ảnh' })).toBeDisabled();
  });

  it('loads more assets with the cursor', async () => {
    listMock
      .mockReset()
      .mockResolvedValueOnce({ items: [asset], nextCursor: 'next-page' })
      .mockResolvedValueOnce({
        items: [{ ...asset, id: '64b0000000000000000000bb', alt: 'Phòng khám' }],
        nextCursor: null,
      });
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Xem thêm' }));
    expect(await screen.findByRole('button', { name: /Phòng khám/ })).toBeInTheDocument();
    expect(listMock).toHaveBeenLastCalledWith(expect.anything(), [SITE_ID], {
      query: { limit: 24, cursor: 'next-page' },
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
    // The button went away with the last page: the first image it brought has the focus.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Phòng khám/ })).toHaveFocus();
    });
  });
});
