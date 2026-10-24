import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SearchIcon } from '../icons';
import { Field } from './Field';
import { Input } from './Input';
import { Textarea } from './Textarea';

describe('Field', () => {
  it('labels its input and points aria-describedby at the help text', () => {
    render(
      <Field label="Đường dẫn trang" help="Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Đường dẫn trang' });
    expect(input).toHaveAccessibleDescription(
      'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.',
    );
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks the control invalid and describes it with the error first', () => {
    render(
      <Field label="Email" error="Email không hợp lệ" help="Dùng email công việc">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Email không hợp lệ Dùng email công việc');
  });

  it('describes a non-blocking warning without marking the control invalid', () => {
    render(
      <Field label="Mô tả ảnh" warning="Cảnh báo: chưa có mô tả ảnh">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Mô tả ảnh' });
    expect(input).toHaveAccessibleDescription('Cảnh báo: chưa có mô tả ảnh');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('shows the optional marker and a label note', () => {
    render(
      <>
        <Field label="Ghi chú cho phiên bản" optional>
          <Input />
        </Field>
        <Field label="Lý do" labelNote="ghi vào nhật ký hoạt động" required>
          <Textarea />
        </Field>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Ghi chú cho phiên bản · tùy chọn' })).toBeVisible();
    const reason = screen.getByRole('textbox', { name: 'Lý do · ghi vào nhật ký hoạt động' });
    expect(reason).toHaveAttribute('aria-required', 'true');
    expect(reason.tagName).toBe('TEXTAREA');
  });

  it.each([
    [{ length: 48, max: 80 }, '48 / 80', 'default'],
    [{ length: 64, max: 200, softMax: 60 }, '64 / 60', 'warning'],
    [{ length: 81, max: 80 }, '81 / 80', 'danger'],
  ] as const)('shows the counter %j as "%s" with tone %s', (counter, text, tone) => {
    render(
      <Field label="Tiêu đề" counter={counter}>
        <Input />
      </Field>,
    );
    const counterElement = screen.getByText(text);
    expect(counterElement).toHaveAttribute('data-tone', tone);
    expect(screen.getByRole('textbox', { name: 'Tiêu đề' })).toHaveAccessibleDescription(text);
  });

  it('hands the wiring to a custom control through the render prop', () => {
    render(
      <Field label="Ảnh khi chia sẻ" help="Khuyên dùng 1200 × 630 px" error="Chọn một ảnh">
        {(control) => (
          <button type="button" {...control}>
            Chọn ảnh riêng cho trang
          </button>
        )}
      </Field>,
    );
    const button = screen.getByRole('button', { name: 'Ảnh khi chia sẻ' });
    expect(button).toHaveAttribute('aria-invalid', 'true');
    expect(button).toHaveAccessibleDescription('Chọn một ảnh Khuyên dùng 1200 × 630 px');
  });

  it('keeps a hidden label as the accessible name', () => {
    render(
      <Field label="Tìm trang" hideLabel>
        <Input type="search" leadingIcon={<SearchIcon size={16} />} placeholder="Tìm theo tên" />
      </Field>,
    );
    expect(screen.getByRole('searchbox', { name: 'Tìm trang' })).toBeInTheDocument();
  });
});

describe('Input', () => {
  it('announces the prefix with the value and accepts typing', async () => {
    render(
      <Field label="Đường dẫn trang" help="Chỉ chữ thường">
        <Input prefix="go.smilecare.vn/" mono defaultValue="uu-dai" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Đường dẫn trang' });
    expect(input).toHaveAccessibleDescription('go.smilecare.vn/ Chỉ chữ thường');
    await userEvent.type(input, '-11');
    expect(input).toHaveValue('uu-dai-11');
  });

  it('works without a Field when given its own name', () => {
    render(<Input aria-label="Tên site" invalid />);
    expect(screen.getByRole('textbox', { name: 'Tên site' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('uses the Field id and lets an explicit description extend the wiring', () => {
    render(
      <>
        <span id="extra">Đã kiểm tra</span>
        <Field id="domain" label="Tên miền" help="Tên miền mặc định">
          <Input aria-describedby="extra" />
        </Field>
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Tên miền' });
    expect(input).toHaveAttribute('id', 'domain');
    expect(input).toHaveAccessibleDescription('Tên miền mặc định Đã kiểm tra');
  });
});
