import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Callout } from './Callout';

describe('Callout', () => {
  it('renders title, body and action with a decorative tone icon', () => {
    const { container } = render(
      <Callout
        tone="danger"
        title="Lỗi chặn · Tiêu đề Hero đang trống"
        action={<button type="button">Sửa ngay</button>}
      >
        Khách truy cập sẽ không biết trang nói về điều gì.
      </Callout>,
    );
    expect(screen.getByText('Lỗi chặn · Tiêu đề Hero đang trống')).toBeInTheDocument();
    expect(screen.getByText('Khách truy cập sẽ không biết trang nói về điều gì.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sửa ngay' })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'danger');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('can announce itself as a status and hide its icon', () => {
    const { container } = render(
      <Callout role="status" tone="success" icon={false}>
        v11 đang live
      </Callout>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('v11 đang live');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('defaults to the info tone', () => {
    const { container } = render(
      <Callout>
        Thiết lập SEO thuộc bản nháp: chỉ có hiệu lực trên trang live sau khi bạn xuất bản.
      </Callout>,
    );
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'info');
  });
});
