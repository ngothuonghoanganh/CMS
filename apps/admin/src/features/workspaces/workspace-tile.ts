/**
 * The colours of a workspace's initials tile on screen 35, so workspaces with like initials still
 * look apart. Each pair is admin tokens (no second palette) whose initials meet WCAG AA: ink, then
 * the nearest tokens to the board's mint and peach, then indigo and slate.
 */
export const workspaceTileTones = [
  { tone: 'ink', background: 'color-ink', initials: 'color-on-primary' },
  { tone: 'mint', background: 'color-success-soft', initials: 'color-success-strong-ink' },
  { tone: 'peach', background: 'color-warning-badge-bg', initials: 'color-warning-ink' },
  { tone: 'indigo', background: 'color-primary-soft', initials: 'color-primary-ink' },
  { tone: 'slate', background: 'color-neutral-badge-bg', initials: 'color-neutral-badge-ink' },
] as const;

export type WorkspaceTileTone = (typeof workspaceTileTones)[number]['tone'];

/**
 * The tone of a workspace's tile, the same on every visit: picked by a hash of its id (FNV-1a), not
 * of its name, so renaming a workspace keeps its colour.
 */
export function workspaceTileTone(workspaceId: string): WorkspaceTileTone {
  let hash = 0x811c9dc5;
  for (let index = 0; index < workspaceId.length; index += 1) {
    hash ^= workspaceId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const entry = workspaceTileTones[hash % workspaceTileTones.length];
  if (entry === undefined) {
    throw new Error('The workspace tile palette is empty');
  }
  return entry.tone;
}
