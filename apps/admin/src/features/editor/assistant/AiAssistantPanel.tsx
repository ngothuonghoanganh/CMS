'use client';

import {
  AI_INSTRUCTION_MAX,
  type AiAssistAction,
  aiAssistActionLabels,
  type AiSuggestionChange,
  type AiSuggestionScope,
  aiToneIds,
  aiToneLabels,
  type AiUsage,
  endpoints,
  type SectionInstance,
} from '@plp/contracts';
import {
  ArrowUpIcon,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuItem,
  Skeleton,
  Spinner,
  VisuallyHidden,
} from '@plp/ui';
import { useQuery } from '@tanstack/react-query';
import { type KeyboardEvent, useId, useState } from 'react';
import { api } from '../../../lib/api';
import { aiQueryKeys } from '../../ai-create/queries';
import { problemMessage } from '../../shell/problem-message';
import { useEditor, useEditorServices } from '../editor-context';
import { AI_PANEL_ID, type AssistConflict, useAiAssistant } from './ai-assistant-context';
import styles from './AiAssistantPanel.module.css';
import {
  acceptedChangesOf,
  actionBlockerOf,
  assistChips,
  changeKeyOf,
  conflictTitleOf,
  dayMonthOf,
  failedTitleOf,
  fieldLabelOf,
  runningLabelOf,
  scopeOptionsOf,
} from './assistant-model';

type ScopeKind = AiSuggestionScope['kind'];

/** A scope the user chose falls back to the next wider one while it is not available. */
const FALLBACKS: Record<ScopeKind, readonly ScopeKind[]> = {
  field: ['field', 'section', 'page'],
  section: ['section', 'page'],
  page: ['page'],
};

function UsageLine({ usage }: { usage: AiUsage }) {
  const count =
    usage.remaining === 0
      ? `Đã dùng ${usage.used}/${usage.limit} lượt tháng này`
      : `Còn ${usage.remaining}/${usage.limit} lượt tháng này`;
  return <p className={styles.usage}>{count} · AI chỉ đọc chữ của bản nháp, không đọc lead.</p>;
}

interface ActionsProps {
  sections: readonly SectionInstance[];
  scope: AiSuggestionScope;
  /** No use left, or the AI writes now: nothing can be asked. */
  disabled: boolean;
}

/** The chips of board 21, "Đổi giọng văn" with its tones, and the free request. */
function Actions({ sections, scope, disabled }: ActionsProps) {
  const assistant = useAiAssistant();
  const [instruction, setInstruction] = useState('');
  const baseId = useId();
  const blockers = new Map(
    assistChips.map((action) => [action, actionBlockerOf(sections, scope, action)] as const),
  );
  const customBlocker = actionBlockerOf(sections, scope, 'custom');
  const canSend = !disabled && customBlocker === null && instruction.trim() !== '';

  function send(action: AiAssistAction, tone?: (typeof aiToneIds)[number]) {
    assistant.ask({ scope, action, tone, instruction: instruction.trim() });
  }

  function onRequestKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSend) {
      event.preventDefault();
      send('custom');
    }
  }

  return (
    <>
      <div role="group" aria-label="Tác vụ của trợ lý" className={styles.chips}>
        {assistChips.map((action, index) => {
          const blocker = blockers.get(action) ?? null;
          const blockerId = `${baseId}-${action}`;
          const chip = (
            <button
              key={action}
              type="button"
              className={styles.chip}
              disabled={disabled}
              aria-disabled={blocker === null ? undefined : true}
              aria-describedby={blocker === null ? undefined : blockerId}
              title={blocker ?? undefined}
              data-ai-focus={index === 0 ? 'actions' : undefined}
              onClick={
                action === 'change_tone' || blocker !== null
                  ? undefined
                  : () => {
                      send(action);
                    }
              }
            >
              {aiAssistActionLabels[action]}
            </button>
          );
          return action === 'change_tone' && blocker === null && !disabled ? (
            <DropdownMenu key={action} trigger={chip} align="start">
              {aiToneIds.map((tone) => (
                <DropdownMenuItem
                  key={tone}
                  onSelect={() => {
                    send('change_tone', tone);
                  }}
                >
                  {aiToneLabels[tone]}
                </DropdownMenuItem>
              ))}
            </DropdownMenu>
          ) : (
            chip
          );
        })}
      </div>
      {assistChips.map((action) => {
        const blocker = blockers.get(action) ?? null;
        return blocker === null ? null : (
          <VisuallyHidden key={action} id={`${baseId}-${action}`}>
            {blocker}
          </VisuallyHidden>
        );
      })}
      <div className={styles.request}>
        <textarea
          aria-label="Yêu cầu cho trợ lý"
          rows={2}
          maxLength={AI_INSTRUCTION_MAX}
          className={styles.requestInput}
          placeholder="Hoặc mô tả bạn muốn, ví dụ: nhấn mạnh trả góp 0%"
          value={instruction}
          disabled={disabled}
          onChange={(event) => {
            setInstruction(event.target.value);
          }}
          onKeyDown={onRequestKeyDown}
        />
        <button
          type="button"
          className={styles.send}
          aria-label="Gửi yêu cầu"
          title="Gửi yêu cầu (Ctrl+Enter)"
          disabled={!canSend}
          onClick={() => {
            send('custom');
          }}
        >
          <ArrowUpIcon size={18} />
        </button>
      </div>
    </>
  );
}

function conflictText(
  sections: readonly SectionInstance[],
  conflict: Extract<AssistConflict, { state: 'shown' | 'accepted' }>,
): string {
  const labels = [
    ...new Set(
      conflict.changes.changed.map(({ sectionId, path }) =>
        fieldLabelOf(sections, sectionId, path),
      ),
    ),
  ];
  const named = labels.slice(0, 3).join(', ') + (labels.length > 3 ? '…' : '');
  return `Bạn đã sửa ${named} sau khi gửi yêu cầu. Gợi ý bên dưới dựa trên nội dung cũ; áp dụng sẽ ghi đè thay đổi đó.`;
}

function Change({
  change,
  sections,
  excluded,
  retrying,
  exhausted,
}: {
  change: AiSuggestionChange;
  sections: readonly SectionInstance[];
  excluded: boolean;
  retrying: boolean;
  /** No use left: a retry would be refused, as "Thử lại" of a failed request is. */
  exhausted: boolean;
}) {
  const assistant = useAiAssistant();
  const key = changeKeyOf(change);
  const label = fieldLabelOf(sections, change.sectionId, change.path);
  return (
    <li className={styles.change}>
      {change.status === 'ok' ? (
        <Checkbox
          className={styles.changeHead}
          label={<span className={styles.changeLabel}>{label}</span>}
          data-ai-part={key}
          checked={!excluded}
          onChange={() => {
            assistant.toggle(key);
          }}
        />
      ) : (
        <span className={`${styles.changeHead} ${styles.changeLabel}`}>{label}</span>
      )}
      <span className={styles.before}>
        <VisuallyHidden>Chữ hiện tại: </VisuallyHidden>
        {change.before.trim() === '' ? 'Chưa có chữ' : change.before}
      </span>
      {change.status === 'ok' ? (
        <span className={styles.after}>
          <VisuallyHidden>Gợi ý: </VisuallyHidden>
          {change.after}
        </span>
      ) : (
        <span className={styles.partFailed}>
          Chưa viết được phần này
          <Button
            size="sm"
            variant="secondary"
            loading={retrying}
            disabled={exhausted && !retrying}
            aria-label={`Thử lại ${label}`}
            onClick={() => {
              assistant.retryPart(key);
            }}
          >
            Thử lại
          </Button>
        </span>
      )}
      {change.status === 'ok' && change.review ? (
        <span className={styles.review}>Kiểm tra lại: câu này nêu số liệu, giá hay cam kết.</span>
      ) : null}
    </li>
  );
}

/** The panel of the "Trợ lý AI" tab (board 21). */
export function AiAssistantPanel() {
  const assistant = useAiAssistant();
  const { siteId } = useEditorServices();
  const sections = useEditor((state) => state.draft.composition.sections);
  const selectedId = useEditor((state) => state.selection.sectionId);
  const [choice, setChoice] = useState<ScopeKind>('section');
  const scopeName = useId();
  const usageQuery = useQuery({
    queryKey: aiQueryKeys.usage(siteId),
    queryFn: () => api(endpoints.aiUsage, [siteId]),
  });

  if (usageQuery.isPending) {
    return (
      <div id={AI_PANEL_ID} className={styles.panel} aria-busy="true">
        <Skeleton height={36} />
        <Skeleton height={80} />
      </div>
    );
  }
  if (usageQuery.isError) {
    return (
      <div id={AI_PANEL_ID} className={styles.panel}>
        <div role="alert" className={styles.failed}>
          <strong className={styles.boxTitle}>Chưa tải được trợ lý AI</strong>
          <span>{problemMessage(usageQuery.error)}</span>
          <Button
            size="sm"
            variant="secondary"
            className={styles.boxAction}
            onClick={() => void usageQuery.refetch()}
          >
            Thử lại
          </Button>
        </div>
      </div>
    );
  }
  const usage = usageQuery.data;
  if (!usage.enabled) {
    return (
      <div id={AI_PANEL_ID} className={styles.panel}>
        <div className={styles.disabled}>
          <strong className={styles.boxTitle}>AI chưa được bật</strong>
          <span>
            Hệ thống chưa nối dịch vụ AI, nên trợ lý chưa gợi ý được chữ. Bạn vẫn sửa chữ trực tiếp
            trên trang hoặc trong tab Thuộc tính như bình thường.
          </span>
        </div>
      </div>
    );
  }

  const { phase } = assistant;
  const options = scopeOptionsOf(sections, selectedId, assistant.focused);
  const kind = FALLBACKS[choice].find((candidate) => options[candidate].scope !== null) ?? 'page';
  const scope = options[kind].scope ?? { kind: 'page' };
  const exhausted = usage.remaining === 0;
  const running = phase.kind === 'running';
  const showActions = phase.kind === 'idle' || phase.kind === 'applied' || running;
  // "Áp dụng N thay đổi" counts the good changes still ticked, never the failed parts.
  const applyCount =
    phase.kind === 'result' ? acceptedChangesOf(phase.result, phase.excluded).length : 0;

  return (
    <div id={AI_PANEL_ID} className={styles.panel}>
      <fieldset className={styles.scope} disabled={running}>
        <legend className={styles.legend}>Phạm vi</legend>
        <div className={styles.scopes}>
          {(['field', 'section', 'page'] as const).map((option) => (
            <label key={option} className={styles.scopeOption}>
              <input
                type="radio"
                name={scopeName}
                checked={kind === option}
                disabled={options[option].scope === null}
                onChange={() => {
                  setChoice(option);
                }}
              />
              {options[option].label}
            </label>
          ))}
        </div>
      </fieldset>

      {showActions ? (
        <Actions sections={sections} scope={scope} disabled={exhausted || running} />
      ) : null}

      {exhausted && showActions ? (
        <p className={styles.quota}>
          <strong>Workspace đã dùng hết {usage.limit} lượt AI tháng này.</strong> Lượt mới có vào{' '}
          {dayMonthOf(usage.resetsOn)}. Bạn vẫn sửa tay bình thường.
        </p>
      ) : null}

      {phase.kind === 'idle' && assistant.notice !== null ? (
        <p className={styles.notice}>{assistant.notice}</p>
      ) : null}

      {phase.kind === 'running' ? (
        <div className={styles.running}>
          <Spinner size={20} />
          <span className={styles.runningText}>
            <strong>{runningLabelOf(phase.ask.action, phase.title)}</strong>
            <span>Bạn vẫn sửa được các section khác.</span>
          </span>
          <Button size="sm" variant="secondary" data-ai-focus="cancel" onClick={assistant.cancel}>
            Hủy
          </Button>
        </div>
      ) : null}

      {phase.kind === 'failed' ? (
        <div role="alert" className={styles.failed}>
          <h3 className={styles.boxTitle} tabIndex={-1} data-ai-focus="failed">
            {failedTitleOf(phase.ask.action, phase.title)}
          </h3>
          <span>{phase.reason} Bản nháp không đổi và lượt này không bị tính.</span>
          <span className={styles.boxActions}>
            <Button size="sm" variant="danger" disabled={exhausted} onClick={assistant.askAgain}>
              Thử lại
            </Button>
            <Button size="sm" variant="secondary" onClick={assistant.discard}>
              Đóng
            </Button>
          </span>
        </div>
      ) : null}

      {phase.kind === 'result' ? (
        <>
          {phase.conflict.state === 'shown' ? (
            <div role="alert" className={styles.conflict}>
              <h3 className={styles.boxTitle} tabIndex={-1} data-ai-focus="conflict">
                {conflictTitleOf(phase.title)}
              </h3>
              <span>{conflictText(sections, phase.conflict)}</span>
              <span className={styles.boxActions}>
                <Button size="sm" disabled={exhausted} onClick={assistant.askAgain}>
                  Tạo lại với nội dung mới
                </Button>
                <Button size="sm" variant="secondary" onClick={assistant.keepSuggestions}>
                  Vẫn xem gợi ý
                </Button>
              </span>
            </div>
          ) : null}
          <section className={styles.result} aria-labelledby={`${scopeName}-result`}>
            <h3
              id={`${scopeName}-result`}
              className={styles.resultTitle}
              tabIndex={-1}
              data-ai-focus="result"
            >
              Gợi ý cho {phase.title}
            </h3>
            <ol className={styles.changes}>
              {phase.result.changes.map((change) => (
                <Change
                  key={changeKeyOf(change)}
                  change={change}
                  sections={sections}
                  excluded={phase.excluded.has(changeKeyOf(change))}
                  retrying={phase.retrying === changeKeyOf(change)}
                  exhausted={exhausted}
                />
              ))}
            </ol>
            {phase.retryNote === null ? null : (
              <p className={styles.retryNote}>{phase.retryNote}</p>
            )}
            <p className={styles.hint}>
              Bản nháp chưa đổi cho tới khi bạn áp dụng. Áp dụng là một bước hoàn tác.
            </p>
            <div className={styles.resultActions}>
              <Button variant="secondary" className={styles.discard} onClick={assistant.discard}>
                Bỏ
              </Button>
              <Button
                className={styles.apply}
                disabled={applyCount === 0 || phase.retrying !== null}
                onClick={assistant.apply}
              >
                Áp dụng {applyCount} thay đổi
              </Button>
            </div>
          </section>
        </>
      ) : null}

      <UsageLine usage={usage} />
    </div>
  );
}
