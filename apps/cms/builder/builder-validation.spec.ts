import { describe, expect, it } from 'vitest';

import {
  createBuilderValidationIssue,
  dedupeBuilderValidationIssues,
  sortBuilderValidationIssues,
  validationIssueFromError,
  validationIssueTargetId,
} from './builder-validation';

describe('builder validation issues', () => {
  const buttonContext = {
    scope: 'page' as const,
    nodeId: 'button-1',
    tab: 'content' as const,
    section: 'link',
    field: 'href',
    viewport: 'desktop' as const,
  };

  it('creates a stable target id from location, not message text', () => {
    expect(validationIssueTargetId(buttonContext)).toBe(
      'page||button-1|content|link||href|desktop',
    );
    expect(
      createBuilderValidationIssue({
        ...buttonContext,
        code: 'BUTTON_URL_INVALID',
        message: 'Enter a valid URL.',
      }),
    ).toMatchObject({
      id: 'page||button-1|content|link||href|desktop',
      severity: 'error',
      code: 'BUTTON_URL_INVALID',
    });
  });

  it('deduplicates repeated reports for the same target', () => {
    const first = createBuilderValidationIssue({
      ...buttonContext,
      code: 'BUTTON_URL_INVALID',
      message: 'Enter a valid URL.',
    });
    const replacement = { ...first, message: 'Enter a complete URL.' };
    expect(dedupeBuilderValidationIssues([first, replacement])).toEqual([replacement]);
  });

  it('sorts current document, node, viewport, and errors first', () => {
    const issues = [
      createBuilderValidationIssue({
        scope: 'footer',
        nodeId: 'footer-button',
        code: 'FIELD_REQUIRED',
        message: 'Enter a value.',
        severity: 'warning',
      }),
      createBuilderValidationIssue({
        ...buttonContext,
        code: 'BUTTON_URL_INVALID',
        message: 'Enter a valid URL.',
      }),
      createBuilderValidationIssue({
        scope: 'page',
        nodeId: 'other-node',
        code: 'FIELD_REQUIRED',
        message: 'Enter a value.',
      }),
    ];
    expect(
      sortBuilderValidationIssues(issues, {
        scope: 'page',
        nodeId: 'button-1',
        viewport: 'desktop',
      }).map((issue) => issue.nodeId),
    ).toEqual(['button-1', 'other-node', 'footer-button']);
  });

  it('maps structured adapter paths to actionable user copy', () => {
    const issue = validationIssueFromError(
      { message: 'Invalid value at props.href', path: ['props', 'href'] },
      buttonContext,
      { code: 'BUTTON_URL_INVALID' },
    );
    expect(issue).toMatchObject({
      code: 'BUTTON_URL_INVALID',
      field: 'href',
      message: 'Enter a valid, safe URL.',
      path: ['props', 'href'],
    });
  });
});
