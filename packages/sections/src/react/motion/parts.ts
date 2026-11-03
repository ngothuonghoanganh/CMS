/*
 * The parts of a section that enter one by one (ADR-032), marked for the runtime and the motion
 * styles. With "Trượt từ bên" text comes from the left and media from the right. A part never holds
 * another part, or it would move twice.
 */
export const MOTION_TEXT = { 'data-m': 'text' } as const;
export const MOTION_MEDIA = { 'data-m': 'media' } as const;
