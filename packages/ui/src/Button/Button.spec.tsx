import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type MouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PlusIcon } from '../icons';
import { Button } from './Button';
import { ButtonLink, type LinkComponentProps } from './ButtonLink';

describe('Button', () => {
  it('renders a native button named by its text, type="button" by default', () => {
    render(<Button>Tạo trang</Button>);
    const button = screen.getByRole('button', { name: 'Tạo trang' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('forwards native props and the ref', async () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} type="submit" form="signup" aria-describedby="why" onClick={onClick}>
        Đăng ký
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Đăng ký' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('form', 'signup');
    expect(button).toHaveAttribute('aria-describedby', 'why');
    expect(ref.current).toBe(button);
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is busy and aria-disabled while loading, and ignores clicks and keys', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Xuất bản v13
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Xuất bản v13' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}[Space]');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps keyboard focus when it starts loading', () => {
    function Publish({ loading }: { loading: boolean }) {
      return <Button loading={loading}>Xuất bản v13</Button>;
    }
    const { rerender } = render(<Publish loading={false} />);
    const button = screen.getByRole('button', { name: 'Xuất bản v13' });
    button.focus();
    rerender(<Publish loading />);
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
    rerender(<Publish loading={false} />);
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('does not submit its form again while loading', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <form aria-label="Đăng nhập" onSubmit={onSubmit}>
        <input aria-label="Email" />
        <Button type="submit" loading>
          Đăng nhập
        </Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'a{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('can be disabled without being busy', () => {
    render(<Button disabled>Lưu</Button>);
    const button = screen.getByRole('button', { name: 'Lưu' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('keeps icons out of the accessible name', () => {
    render(
      <Button variant="secondary" leadingIcon={<PlusIcon />}>
        Thêm section
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Thêm section' });
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ButtonLink', () => {
  it('renders an anchor with the href by default', () => {
    render(
      <ButtonLink href="/sites/1/pages/new" leadingIcon={<PlusIcon />}>
        Tạo trang
      </ButtonLink>,
    );
    expect(screen.getByRole('link', { name: 'Tạo trang' })).toHaveAttribute(
      'href',
      '/sites/1/pages/new',
    );
  });

  it('renders through the link component passed with `as`', async () => {
    const seen: LinkComponentProps[] = [];
    function RouterLink(props: LinkComponentProps) {
      seen.push(props);
      return <a {...props} data-router="yes" />;
    }
    const onClick = vi.fn((event: MouseEvent) => {
      event.preventDefault();
    });
    render(
      <ButtonLink as={RouterLink} href="/editor" variant="secondary" onClick={onClick}>
        Mở editor
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'Mở editor' });
    expect(link).toHaveAttribute('data-router', 'yes');
    expect(link).toHaveAttribute('href', '/editor');
    expect(seen.at(-1)?.className).toEqual(expect.any(String));
    await userEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
