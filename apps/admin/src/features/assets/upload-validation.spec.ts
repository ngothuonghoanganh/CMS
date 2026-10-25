import { describe, expect, it } from 'vitest';
import { formatBytes, validateImageFile, validateUpload } from './upload-validation';

function file(type: string, size = 100): File {
  const result = new File(['x'], 'anh', { type });
  Object.defineProperty(result, 'size', { value: size });
  return result;
}

describe('upload validation', () => {
  it('accepts the image types of the API and nothing else', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']) {
      expect(validateImageFile(file(type))).toBeNull();
    }
    for (const type of ['image/svg+xml', 'application/pdf', '']) {
      expect(validateImageFile(file(type))).toBe('Chỉ nhận ảnh JPG, PNG, WebP, AVIF hoặc GIF.');
    }
  });

  it('accepts exactly 10 MB and refuses more, or an empty file', () => {
    expect(validateImageFile(file('image/png', 10 * 1024 * 1024))).toBeNull();
    expect(validateImageFile(file('image/png', 10 * 1024 * 1024 + 1))).toMatch(/10 MB/);
    expect(validateImageFile(file('image/png', 0))).toMatch(/trống/);
  });

  it('needs a file and a description unless the image is decorative', () => {
    expect(validateUpload({ file: null, alt: '', decorative: false })).toEqual({
      file: 'Chọn một ảnh để tải lên.',
      alt: 'Nhập mô tả ảnh hoặc đánh dấu "Ảnh chỉ để trang trí"',
    });
    expect(validateUpload({ file: file('image/png'), alt: '   ', decorative: false }).alt).toBe(
      'Nhập mô tả ảnh hoặc đánh dấu "Ảnh chỉ để trang trí"',
    );
    expect(validateUpload({ file: file('image/png'), alt: '', decorative: true })).toEqual({});
    expect(validateUpload({ file: file('image/png'), alt: 'Ảnh', decorative: false })).toEqual({});
  });

  it('formats sizes for the library', () => {
    expect(formatBytes(820 * 1024)).toBe('820 KB');
    expect(formatBytes(1.25 * 1024 * 1024)).toBe('1,3 MB');
  });
});
