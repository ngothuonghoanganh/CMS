import type { AiBrief, AiLanguage, AiTone, SectionInstance } from '@plp/contracts';
import { getSectionDefinition, goalDefinitions } from '@plp/sections/schema';
import type { CopyIssue, CopyPlan, CopySlot } from './section-copy.js';
import { currentCopyOf } from './section-copy.js';

/**
 * The words sent to the AI for one section (ADR-031). They hold the brief the user typed, the
 * site name and the section's draft text, and nothing else: a prompt is built from these inputs
 * only, so leads, consent texts, lead addresses or member data cannot get into one.
 */
export interface PromptContext {
  siteName: string;
  brief: AiBrief;
  /** The page's sections in order, as the structure step names them. */
  outline: readonly string[];
}

export interface SectionPrompt {
  system: string;
  prompt: string;
}

const LANGUAGES: Record<AiLanguage, string> = {
  vi: 'Vietnamese, with full diacritics',
  en: 'English',
};

const TONES: Record<AiTone, string> = {
  friendly: 'warm and friendly, speaking directly to the reader',
  professional: 'clear, professional and trustworthy',
  energetic: 'upbeat and energetic, with short sentences',
};

function systemText(brief: AiBrief): string {
  return [
    'You write the copy of one section of a landing page for a small business.',
    'Rules:',
    `- Write in ${LANGUAGES[brief.language]}. Tone: ${TONES[brief.tone]}.`,
    '- Plain text only: no HTML, no Markdown, no emoji.',
    '- Keep every field within its maximum length.',
    '- Use only facts from the brief. Never invent prices, discounts, figures, durations, guarantees, awards, policies, or claims about health, safety or results.',
    '- Never write phone numbers, addresses, email addresses, links or the names of real people.',
    '- In "review", list the field of every sentence you wrote that states a figure, a price, a promise or a health claim, e.g. "subheading" or "items.1.answer".',
    '- Answer with one JSON object that matches the JSON Schema you are given, and nothing else.',
  ].join('\n');
}

function slotLine(slot: CopySlot, indent: string): string {
  return `${indent}- ${slot.key}: ${slot.label}, ${slot.required ? 'required' : 'optional'}, at most ${slot.maxLength} characters`;
}

/**
 * The fields to write. A list suggests as many items as the section has now: allowed up to twelve
 * FAQ answers, a small model writes all twelve, a minute of output and twelve claims to check.
 */
function fieldLines(plan: CopyPlan, current: Record<string, unknown>): string[] {
  return [
    ...plan.fields.map((slot) => slotLine(slot, '')),
    ...plan.lists.flatMap((list) => {
      const items = current[list.key];
      const usual = Array.isArray(items) && items.length > 0 ? `, usually ${items.length}` : '';
      return [
        `- ${list.key}: ${list.min} to ${list.max} items "${list.itemLabel}"${usual}, each with:`,
        ...list.fields.map((slot) => slotLine(slot, '  ')),
      ];
    }),
  ];
}

/** The system text and prompt that ask for a section's copy. */
export function buildSectionPrompt(
  context: PromptContext,
  section: Pick<SectionInstance, 'type' | 'variant' | 'content'>,
  plan: CopyPlan,
): SectionPrompt {
  const { brief } = context;
  const definition = getSectionDefinition(section.type);
  const goal = goalDefinitions[brief.goal];
  const current = currentCopyOf(section, plan);
  const prompt = [
    `Site: ${context.siteName}`,
    `Page goal: ${goal.title} (${goal.description})`,
    'Brief:',
    `- Product or service: ${brief.product}`,
    `- Target customers: ${brief.audience}`,
    `- Key message and differentiators: ${brief.differentiators}`,
    `- Content the business already has: ${brief.existingContent === '' ? '(none)' : brief.existingContent}`,
    `Page sections, in order: ${context.outline.map((name, index) => `${index + 1}. ${name}`).join(', ')}`,
    `Section to write: ${definition.label}: ${definition.description}`,
    `Section type: ${section.type}`,
    'Fields:',
    ...fieldLines(plan, current),
    'Current text of this section, sample copy to replace:',
    JSON.stringify(current),
    // Said last too: a small model otherwise writes in the language of the brief and the sample.
    `Write every field in ${LANGUAGES[brief.language]}.`,
  ].join('\n');
  return { system: systemText(brief), prompt };
}

/** The prompt again, with what made the last answer unusable, for its one retry. */
export function withRetryFeedback(
  prompt: SectionPrompt,
  issues: readonly CopyIssue[],
): SectionPrompt {
  return {
    system: prompt.system,
    prompt: [
      prompt.prompt,
      'Your previous answer could not be used:',
      ...issues.map(
        (issue) => `- ${issue.path === '' ? 'the answer' : issue.path} ${issue.message}`,
      ),
      'Write the whole JSON object again, fixing these.',
    ].join('\n'),
  };
}
