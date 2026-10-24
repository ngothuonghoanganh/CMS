import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Field } from '../Field/Field';
import { Select } from './Select';

describe('Select', () => {
  it('is a native combobox wired to its Field', async () => {
    const onChange = vi.fn();
    render(
      <Field
        label="Thứ tự trên điện thoại"
        help="Nội dung luôn giống nhau trên mọi thiết bị; chỉ thứ tự và ẩn/hiện được tùy chỉnh."
      >
        <Select defaultValue="auto" onChange={onChange}>
          <option value="auto">Tự động (chữ trước, ảnh sau)</option>
          <option value="media-first">Ảnh trước</option>
        </Select>
      </Field>,
    );
    const select = screen.getByRole('combobox', { name: 'Thứ tự trên điện thoại' });
    expect(select).toHaveAccessibleDescription(
      'Nội dung luôn giống nhau trên mọi thiết bị; chỉ thứ tự và ẩn/hiện được tùy chỉnh.',
    );
    await userEvent.selectOptions(select, 'media-first');
    expect(select).toHaveValue('media-first');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reflects a Field error', () => {
    render(
      <Field label="Khi bấm, đưa tới" error="Chọn section đích">
        <Select defaultValue="">
          <option value="">Chọn…</option>
        </Select>
      </Field>,
    );
    expect(screen.getByRole('combobox', { name: 'Khi bấm, đưa tới' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});
