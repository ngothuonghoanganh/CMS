import type { WorkflowExpression, WorkflowValue } from '@payload/contracts';

export type WorkflowLookupContext = Record<string, unknown>;

export function resolveWorkflowValue(
  value: WorkflowValue | WorkflowExpression | unknown,
  context: WorkflowLookupContext,
): unknown {
  if (isExpression(value)) return evaluateWorkflowExpression(value, context);
  if (isBinding(value)) return getPath(context, value.path);
  if (isLiteral(value)) return value.value;
  return value;
}

export function evaluateWorkflowExpression(
  expression: WorkflowExpression,
  context: WorkflowLookupContext,
): boolean {
  switch (expression.operator) {
    case 'AND':
      return (expression.operands ?? []).every((operand) =>
        Boolean(resolveWorkflowValue(operand, context)),
      );
    case 'OR':
      return (expression.operands ?? []).some((operand) =>
        Boolean(resolveWorkflowValue(operand, context)),
      );
    case 'NOT':
      return !Boolean(resolveWorkflowValue(expression.left ?? null, context));
    case 'exists':
      return resolveWorkflowValue(expression.left ?? null, context) !== undefined;
    case 'notExists':
      return resolveWorkflowValue(expression.left ?? null, context) === undefined;
    case 'equals':
      return typedEqual(
        resolveWorkflowValue(expression.left ?? null, context),
        resolveWorkflowValue(expression.right ?? null, context),
      );
    case 'notEquals':
      return !typedEqual(
        resolveWorkflowValue(expression.left ?? null, context),
        resolveWorkflowValue(expression.right ?? null, context),
      );
    case 'contains':
      return contains(
        resolveWorkflowValue(expression.left ?? null, context),
        resolveWorkflowValue(expression.right ?? null, context),
      );
    case 'notContains':
      return !contains(
        resolveWorkflowValue(expression.left ?? null, context),
        resolveWorkflowValue(expression.right ?? null, context),
      );
    case 'greaterThan':
      return compare(expression, context) > 0;
    case 'greaterThanOrEqual':
      return compare(expression, context) >= 0;
    case 'lessThan':
      return compare(expression, context) < 0;
    case 'lessThanOrEqual':
      return compare(expression, context) <= 0;
  }
}

function compare(expression: WorkflowExpression, context: WorkflowLookupContext): number {
  const left = resolveWorkflowValue(expression.left ?? null, context);
  const right = resolveWorkflowValue(expression.right ?? null, context);
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const leftDate = asDate(left);
  const rightDate = asDate(right);
  if (leftDate !== undefined && rightDate !== undefined) return leftDate - rightDate;
  if (typeof left === 'string' && typeof right === 'string')
    return left.localeCompare(right);
  return Number.NaN;
}

function typedEqual(left: unknown, right: unknown): boolean {
  if (typeof left !== typeof right) return false;
  if (left instanceof Date || right instanceof Date) {
    return asDate(left) === asDate(right);
  }
  return left === right;
}

function contains(left: unknown, right: unknown): boolean {
  if (typeof left === 'string' && typeof right === 'string') return left.includes(right);
  if (Array.isArray(left)) return left.some((entry) => typedEqual(entry, right));
  return false;
}

function asDate(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}

function getPath(context: WorkflowLookupContext, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, context);
}

function isExpression(value: unknown): value is WorkflowExpression {
  return Boolean(value && typeof value === 'object' && 'operator' in value);
}
function isBinding(value: unknown): value is { kind: 'binding'; path: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).kind === 'binding' &&
    typeof (value as Record<string, unknown>).path === 'string',
  );
}
function isLiteral(value: unknown): value is { kind: 'literal'; value: unknown } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).kind === 'literal' &&
    'value' in value,
  );
}
