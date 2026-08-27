export type SaveStatusAfterAcknowledgement = 'saved' | 'unsaved';

export function saveStatusAfterAcknowledgement(
  saveSequence: number,
  currentMutationSequence: number,
): SaveStatusAfterAcknowledgement {
  return saveSequence === currentMutationSequence ? 'saved' : 'unsaved';
}
