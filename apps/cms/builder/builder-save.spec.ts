import { describe, expect, it } from 'vitest';

import {
  canStartBuilderSave,
  isBuilderPublishDisabled,
  saveStatusAfterAcknowledgement,
} from './builder-save';

describe('builder save acknowledgement', () => {
  it('marks the document saved when no mutation followed the request', () => {
    expect(saveStatusAfterAcknowledgement(4, 4)).toBe('saved');
  });

  it('keeps the document unsaved when a newer mutation followed the request', () => {
    expect(saveStatusAfterAcknowledgement(4, 5)).toBe('unsaved');
  });

  it('keeps Save available when validation issues are only field-level', () => {
    expect(canStartBuilderSave({ editorReady: true, saveInFlight: false })).toBe(true);
  });

  it('only disables Save while the editor is unavailable or another save is running', () => {
    expect(canStartBuilderSave({ editorReady: false, saveInFlight: false })).toBe(false);
    expect(canStartBuilderSave({ editorReady: true, saveInFlight: true })).toBe(false);
  });

  it('requires a saved draft before offering Publish', () => {
    expect(
      isBuilderPublishDisabled({
        busy: false,
        hasDraft: true,
        saveStatus: 'unsaved',
      }),
    ).toBe(true);
    expect(
      isBuilderPublishDisabled({
        busy: false,
        hasDraft: true,
        saveStatus: 'saved',
      }),
    ).toBe(false);
  });

  it('disables Publish when readiness or a validation response blocks it', () => {
    const base = { busy: false, hasDraft: true, saveStatus: 'saved' };
    expect(isBuilderPublishDisabled({ ...base, readiness: false })).toBe(true);
    expect(isBuilderPublishDisabled({ ...base, readinessLoading: true })).toBe(true);
    expect(isBuilderPublishDisabled({ ...base, validationBlocked: true })).toBe(true);
  });
});
