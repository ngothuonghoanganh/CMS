// @vitest-environment jsdom
import { leadFieldId, LeadFormView, type LeadFormViewProps } from '@plp/sections/react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadFormSlot } from './LeadFormSlot';

// The form's script arrives when the test says so, as it would on a slow phone.
const script = vi.hoisted(() => {
  const gate: { open: () => void } = {
    open: () => {
      throw new Error('The script gate is not set up');
    },
  };
  const arrived = new Promise<void>((resolve) => {
    gate.open = resolve;
  });
  return {
    arrived,
    arrive: () => {
      gate.open();
    },
  };
});

vi.mock(import('./LeadFormClient'), async (importOriginal) => {
  await script.arrived;
  return importOriginal();
});

const PROPS: LeadFormViewProps = {
  sectionId: 'form00000001',
  content: {
    heading: 'Đặt lịch tư vấn',
    description: '',
    showEmail: false,
    showMessage: false,
    submitLabel: 'Gửi đăng ký',
    successTitle: 'Đã nhận đăng ký',
    successMessage: 'Smile Care sẽ gọi lại cho bạn trong hôm nay.',
  },
  capture: {
    requiredText: 'Tôi đồng ý để Smile Care liên hệ tư vấn.',
    marketingText: null,
    policyUrl: 'https://smilecare.vn/chinh-sach',
  },
  releaseId: 'c'.repeat(24),
  submissionId: '9b2f1c4e-0d6a-4e1f-8c3b-5a7d9e0f1a2b',
};

function input(field: 'name' | 'phone' | 'consent'): HTMLInputElement {
  const element = document.getElementById(leadFieldId(PROPS.sectionId, field));
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`No field ${field}`);
  }
  return element;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('LeadFormSlot', () => {
  it('keeps what a visitor typed before the form’s script arrived (ADR-016)', async () => {
    // As on a live page: the server's form, drawn while the script loads, is not React's to
    // unmount; React only removes it from the page once its own form is ready.
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<LeadFormSlot {...PROPS} fallback={<LeadFormView {...PROPS} />} />);
      await Promise.resolve();
    });

    // The server's form, typed in while the script loads.
    const serverName = input('name');
    for (const [field, value] of [
      ['name', 'Nguyễn Thu Hà'],
      ['phone', '0901 234 567'],
    ] as const) {
      input(field).value = value;
      input(field).dispatchEvent(new Event('input', { bubbles: true }));
    }
    input('consent').click();
    serverName.focus();
    serverName.setSelectionRange(6, 6);
    serverName.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    await act(async () => {
      script.arrive();
      await script.arrived;
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // The script's own form replaced the server's, and holds the same input.
    expect(input('name')).not.toBe(serverName);
    expect(input('name').value).toBe('Nguyễn Thu Hà');
    expect(input('phone').value).toBe('0901 234 567');
    expect(input('consent').checked).toBe(true);
    expect(document.activeElement).toBe(input('name'));
    expect(input('name').selectionStart).toBe(6);
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });
});
