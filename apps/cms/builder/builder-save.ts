export type SaveStatusAfterAcknowledgement = 'saved' | 'unsaved';

export type BuilderSaveGate = {
  editorReady: boolean;
  saveInFlight: boolean;
};

export type BuilderPublishGate = {
  busy: boolean;
  hasDraft: boolean;
  saveStatus: string;
  /** A failed readiness check is a deliberate, field-level publish block. */
  readiness?: boolean | null;
  readinessLoading?: boolean;
  validationBlocked?: boolean;
};

/** Save is unavailable only while the editor is not ready or another save runs. */
export function canStartBuilderSave(input: BuilderSaveGate): boolean {
  return input.editorReady && !input.saveInFlight;
}

/**
 * Publish is an explicit final step. It must only be offered for a saved draft
 * and a document that passed the server readiness check. Validation messages
 * collected while editing do not participate in this gate; the field control
 * that produced them owns whether its operation is enabled.
 */
export function isBuilderPublishDisabled(input: BuilderPublishGate): boolean {
  return Boolean(
    input.busy ||
    !input.hasDraft ||
    input.saveStatus !== 'saved' ||
    input.readinessLoading ||
    input.readiness === false ||
    input.validationBlocked,
  );
}

export function saveStatusAfterAcknowledgement(
  saveSequence: number,
  currentMutationSequence: number,
): SaveStatusAfterAcknowledgement {
  return saveSequence === currentMutationSequence ? 'saved' : 'unsaved';
}
