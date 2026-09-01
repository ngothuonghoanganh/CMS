'use client';

import type { BuilderValidationIssue } from './builder-validation';

type BuilderValidationNavigatorProps = {
  issues: readonly BuilderValidationIssue[];
  nodeLabels?: ReadonlyMap<string, string>;
  onFocusIssue: (issue: BuilderValidationIssue) => void;
};

function issueLabel(
  issue: BuilderValidationIssue,
  nodeLabels?: ReadonlyMap<string, string>,
) {
  if (issue.nodeId && nodeLabels?.get(issue.nodeId)) return nodeLabels.get(issue.nodeId);
  if (issue.partName) return issue.partName;
  if (issue.field) return issue.field;
  return issue.scope;
}

export function BuilderValidationNavigator({
  issues,
  nodeLabels,
  onFocusIssue,
}: BuilderValidationNavigatorProps) {
  if (issues.length === 0) return null;
  const first = issues[0];
  if (!first) return null;
  return (
    <section
      aria-label="Validation issues"
      className="builder-validation-navigator"
      data-builder-validation-summary
      role="region"
    >
      <div className="builder-validation-navigator-heading">
        <div>
          <span className="eyebrow">Needs attention</span>
          <strong>
            {issues.length} issue{issues.length === 1 ? '' : 's'} need attention
          </strong>
        </div>
        <button
          className="button button-small button-primary"
          onClick={() => onFocusIssue(first)}
          type="button"
        >
          Fix first issue
        </button>
      </div>
      <ul className="builder-validation-navigator-list">
        {issues.map((issue) => (
          <li key={issue.id}>
            <button
              className="builder-validation-navigator-row"
              onClick={() => onFocusIssue(issue)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`builder-validation-severity is-${issue.severity}`}
              >
                {issue.severity === 'error' ? '●' : '▲'}
              </span>
              <span>
                <strong>{issueLabel(issue, nodeLabels)}</strong>
                <small>{issue.message}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
