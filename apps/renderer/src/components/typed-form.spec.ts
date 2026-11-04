// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readTypedForm, writeTypedForm } from './typed-form';

/** A lead form as the server and the client draw it, with the same names. */
function form(id: string): HTMLFormElement {
  const element = document.createElement('form');
  element.id = id;
  element.innerHTML = `
    <input type="hidden" name="releaseId" value="r1" />
    <input type="hidden" name="submissionId" value="s1" />
    <input type="text" name="website" />
    <input type="text" name="name" />
    <input type="tel" name="phone" />
    <input type="email" name="email" />
    <textarea name="message"></textarea>
    <input type="checkbox" name="consent" value="yes" />
    <input type="checkbox" name="marketing" value="yes" />`;
  document.body.append(element);
  return element;
}

function field(target: HTMLFormElement, name: string) {
  const element = target.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`No field ${name}`);
  }
  return element;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('typed-form', () => {
  it('finds nothing to carry when the visitor did nothing yet', () => {
    expect(readTypedForm(form('server'))).toBeNull();
    expect(readTypedForm(null)).toBeNull();
  });

  it('carries what was typed and ticked into the form that replaces the server’s', () => {
    const server = form('server');
    field(server, 'name').value = 'Nguyễn Thu Hà';
    field(server, 'phone').value = '0901 234 567';
    field(server, 'message').value = 'Tư vấn buổi tối';
    (field(server, 'consent') as HTMLInputElement).checked = true;
    const typed = readTypedForm(server);
    expect(typed).toEqual({
      values: { name: 'Nguyễn Thu Hà', phone: '0901 234 567', message: 'Tư vấn buổi tối' },
      checked: { consent: true },
      focus: null,
    });

    server.remove();
    const client = form('client');
    if (typed === null) {
      throw new Error('Nothing typed');
    }
    writeTypedForm(client, typed);
    expect(field(client, 'name').value).toBe('Nguyễn Thu Hà');
    expect(field(client, 'phone').value).toBe('0901 234 567');
    expect(field(client, 'message').value).toBe('Tư vấn buổi tối');
    expect((field(client, 'consent') as HTMLInputElement).checked).toBe(true);
    expect((field(client, 'marketing') as HTMLInputElement).checked).toBe(false);
    // The page's own hidden fields are never the visitor's to carry.
    expect(field(client, 'releaseId').value).toBe('r1');
  });

  it('keeps the visitor typing where they were: focus and caret', () => {
    const server = form('server');
    const name = field(server, 'name');
    name.value = 'Nguyễn Thu';
    name.focus();
    name.setSelectionRange(3, 6);
    const typed = readTypedForm(server);
    expect(typed?.focus).toEqual({ name: 'name', start: 3, end: 6 });

    server.remove();
    const client = form('client');
    if (typed === null) {
      throw new Error('Nothing typed');
    }
    writeTypedForm(client, typed);
    const moved = field(client, 'name');
    expect(document.activeElement).toBe(moved);
    expect([moved.selectionStart, moved.selectionEnd]).toEqual([3, 6]);
  });

  it('focuses an email field without placing a caret it does not have', () => {
    const server = form('server');
    const email = field(server, 'email');
    email.value = 'ha@example.com';
    email.focus();
    const typed = readTypedForm(server);
    expect(typed?.focus).toEqual({ name: 'email', start: null, end: null });
    server.remove();
    const client = form('client');
    if (typed !== null) {
      writeTypedForm(client, typed);
    }
    expect(document.activeElement).toBe(field(client, 'email'));
    expect(field(client, 'email').value).toBe('ha@example.com');
  });
});
