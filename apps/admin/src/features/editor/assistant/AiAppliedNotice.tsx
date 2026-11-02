'use client';

import { useAiApplied } from './ai-assistant-context';
import styles from './AiAppliedNotice.module.css';

/**
 * "Đã áp dụng N thay đổi vào bản nháp" at the foot of the canvas (board 21), with "Hoàn tác" while
 * the apply is still the last change; Ctrl+Z undoes it too. The editor's announcer already said it.
 */
export function AiAppliedNotice() {
  const applied = useAiApplied();
  if (applied === null) {
    return null;
  }
  return (
    <div className={styles.notice}>
      <span>Đã áp dụng {applied.count} thay đổi vào bản nháp</span>
      <button type="button" className={styles.undo} data-ai-focus="undo" onClick={applied.undo}>
        Hoàn tác
      </button>
    </div>
  );
}
