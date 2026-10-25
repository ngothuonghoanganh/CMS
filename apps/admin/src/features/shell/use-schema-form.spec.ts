import { loginRequestSchema } from '@plp/contracts';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fieldError, firstInvalidField, useSchemaForm } from './use-schema-form';

function renderLoginForm() {
  return renderHook(() => useSchemaForm(loginRequestSchema, { email: '', password: '' }));
}

describe('useSchemaForm', () => {
  it('returns the parsed values of a valid form', () => {
    const { result } = renderLoginForm();
    act(() => {
      result.current.setValue('email', ' NgocAnh@MayXanh.vn ');
      result.current.setValue('password', 'mat-khau');
    });
    let validation: ReturnType<typeof result.current.validate> | undefined;
    act(() => {
      validation = result.current.validate();
    });
    expect(validation).toEqual({
      ok: true,
      data: { email: 'ngocanh@mayxanh.vn', password: 'mat-khau' },
    });
    expect(result.current.errors).toEqual({});
  });

  it('reports one message per field on submit and re-checks a shown error while typing', () => {
    const { result } = renderLoginForm();
    act(() => {
      result.current.validate();
    });
    expect(result.current.errors).toEqual({
      email: 'Email không hợp lệ',
      password: 'Nhập mật khẩu',
    });
    act(() => {
      result.current.setValue('password', 'x');
    });
    expect(result.current.errors).toEqual({ email: 'Email không hợp lệ' });
  });

  it('checks a field on blur only', () => {
    const { result } = renderLoginForm();
    act(() => {
      result.current.blur('email');
    });
    expect(result.current.errors).toEqual({ email: 'Email không hợp lệ' });
  });

  it('keeps server errors of known fields only', () => {
    const { result } = renderLoginForm();
    act(() => {
      result.current.setServerErrors({ email: 'Email này đã được đăng ký', other: 'x' });
    });
    expect(result.current.errors).toEqual({ email: 'Email này đã được đăng ký' });
  });
});

describe('helpers', () => {
  it('gives the first message of a field schema', () => {
    expect(fieldError(loginRequestSchema.shape.password, '')).toBe('Nhập mật khẩu');
    expect(fieldError(loginRequestSchema.shape.password, 'ok')).toBeUndefined();
  });

  it('finds the first invalid field in form order', () => {
    expect(firstInvalidField(['email', 'password'], { password: 'x' })).toBe('password');
    expect(firstInvalidField(['email', 'password'], {})).toBeUndefined();
  });
});
