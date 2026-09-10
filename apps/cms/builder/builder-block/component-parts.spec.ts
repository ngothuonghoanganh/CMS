import { describe, expect, it } from 'vitest';
import {
  componentHasStyleTargets,
  isSelectedStyleTarget,
  styleableComponentParts,
  styleTargetsForComponent,
} from './component-parts';

describe('component part style targets', () => {
  it('exposes editable form internals without adding content nodes', () => {
    expect(styleableComponentParts('form').map((part) => part.name)).toEqual([
      'field',
      'label',
      'input',
      'option',
      'submit',
      'error',
      'success',
    ]);
  });

  it('exposes tab internals and gives every block a direct Style entry point', () => {
    expect(styleableComponentParts('tabs').map((part) => part.name)).toEqual([
      'list',
      'tab',
      'activeTab',
      'panel',
    ]);
    expect(componentHasStyleTargets('button')).toBe(false);
    expect(styleTargetsForComponent('button')).toEqual([{ label: 'Block' }]);
  });

  it('exposes visual descendants for the remaining composite blocks', () => {
    expect(styleableComponentParts('countdown').map((part) => part.name)).toEqual([
      'label',
      'timer',
    ]);
    expect(styleableComponentParts('list').map((part) => part.name)).toEqual(['item']);
    expect(styleableComponentParts('quote').map((part) => part.name)).toEqual([
      'content',
      'citation',
    ]);
    expect(styleableComponentParts('gallery').map((part) => part.name)).toEqual([
      'image',
    ]);
  });

  it('matches a style target only to its owning node and part', () => {
    const target = { nodeId: 'form-1', partName: 'submit' };
    expect(isSelectedStyleTarget(target, 'form-1', 'submit')).toBe(true);
    expect(isSelectedStyleTarget(target, 'form-2', 'submit')).toBe(false);
    expect(isSelectedStyleTarget(target, 'form-1', 'input')).toBe(false);
  });
});
