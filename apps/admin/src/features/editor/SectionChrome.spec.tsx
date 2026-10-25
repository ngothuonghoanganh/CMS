import { MAX_SECTIONS } from '@plp/contracts';
import { createSectionInstance } from '@plp/sections/schema';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Canvas } from './Canvas';
import { makeStore, pageDetail, sectionIds } from './test-fixtures';
import { renderEditor } from './test-render';

const HERO = 'hero00000001';

function toolbar(name: string) {
  return within(screen.getByRole('toolbar', { name: `Thao tác với section ${name}` }));
}

describe('SectionChrome toolbar', () => {
  it('keeps keyboard focus in the toolbar when a move reaches the last free slot', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(HERO);
    renderEditor(<Canvas />, { store });

    toolbar('Hero').getByRole('button', { name: 'Chuyển xuống' }).focus();
    await user.keyboard('{Enter}');
    expect(toolbar('Hero').getByRole('button', { name: 'Chuyển xuống' })).toHaveFocus();
    await user.keyboard('{Enter}');
    // navbar · benefits · faq · hero · footer: Hero cannot go below the footer.
    expect(sectionIds(store)[3]).toBe(HERO);
    expect(toolbar('Hero').getByRole('button', { name: 'Chuyển xuống' })).toBeDisabled();
    expect(toolbar('Hero').getByRole('button', { name: 'Chuyển lên' })).toHaveFocus();
  });

  it('disables "Nhân bản section" at the section limit and says why', () => {
    const sections = Array.from({ length: MAX_SECTIONS }, (_value, index) =>
      createSectionInstance('faq', undefined, `faq${String(index).padStart(9, '0')}`),
    );
    const store = makeStore({ detail: pageDetail({ version: 1, sections }) });
    store.getState().select('faq000000000');
    renderEditor(<Canvas />, { store });

    const duplicate = toolbar('Câu hỏi thường gặp').getByRole('button', {
      name: 'Nhân bản section',
    });
    expect(duplicate).toBeDisabled();
    expect(duplicate).toHaveAccessibleDescription(`Một trang có tối đa ${MAX_SECTIONS} section.`);
  });
});
