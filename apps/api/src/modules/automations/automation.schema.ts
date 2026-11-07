import {
  type AutomationDefinition,
  type AutomationPausedReason,
  type AutomationRecipe,
  type AutomationRunStatus,
  type AutomationState,
  type AutomationTriggerKind,
  automationPausedReasons,
  automationRunStatuses,
  automationStates,
  type OpportunityStage,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';
import type { StoredWebhookSecret } from './webhook-secrets.js';

export const AUTOMATION_MODEL = 'Automation';
export const AUTOMATION_RUN_MODEL = 'AutomationRun';
export const AUTOMATION_USAGE_MODEL = 'AutomationUsage';
export const AUTOMATION_RUN_EVENT_INDEX = 'automation_runs_event_unique';
export const AUTOMATION_USAGE_MONTH_INDEX = 'automation_usage_month_unique';

/** Runs are deleted 90 days after they were created (ADR-034). */
export const AUTOMATION_RUN_TTL_DAYS = 90;

/**
 * An automation of a site (ADR-034). Its definition is checked by the contracts' schemas at the
 * boundary; each save adds one to `version`, and a run keeps the definition it was created with.
 */
export interface AutomationRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  name: string;
  state: AutomationState;
  pausedReason: AutomationPausedReason | null;
  version: number;
  definition: AutomationDefinition;
  /** The trigger's kind again, for the events' index. */
  triggerKind: AutomationTriggerKind;
  recipe: AutomationRecipe | null;
  /** The encrypted secrets of the webhook steps, by `secretId` (ADR-034). */
  webhookSecrets: StoredWebhookSecret[];
  /** The next member of an "assign" rotation, counted up by each run that assigns. */
  rotation: number;
  consecutiveFailures: number;
  /** Events passed over in `month` because the workspace had no run left. */
  skippedForQuota: { month: string; count: number };
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const automationSchema = new Schema<AutomationRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    state: { type: String, enum: automationStates, required: true },
    pausedReason: { type: String, enum: [...automationPausedReasons, null], default: null },
    version: { type: Number, required: true, min: 1 },
    definition: { type: Schema.Types.Mixed, required: true },
    triggerKind: { type: String, required: true },
    recipe: { type: String, default: null },
    rotation: { type: Number, required: true, min: 0 },
    webhookSecrets: {
      type: [
        new Schema<StoredWebhookSecret>(
          {
            id: { type: String, required: true },
            ciphertext: { type: String, required: true },
            iv: { type: String, required: true },
            tag: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    consecutiveFailures: { type: Number, required: true, min: 0 },
    skippedForQuota: {
      month: { type: String, default: '' },
      count: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'automations', versionKey: false, minimize: false },
);
// The list of board 25, oldest first; and the automations an event of a site starts.
automationSchema.index({ siteId: 1, createdAt: 1, _id: 1 }, { name: 'automations_site' });
automationSchema.index({ siteId: 1, state: 1, triggerKind: 1 }, { name: 'automations_trigger' });

/** The event a run answers. Ids only: a run holds no personal data (ADR-034). */
export interface AutomationEvent {
  kind: AutomationTriggerKind;
  leadId: Types.ObjectId | null;
  opportunityId: Types.ObjectId | null;
  taskId: Types.ObjectId | null;
  /** The stage an opportunity entered, for `opportunity_stage_changed`. */
  stage: OpportunityStage | null;
  /** When it happened; for `task_overdue`, the task's due time it waits for. */
  at: Date;
}

/** The step's error: a code and, for a webhook, the HTTP status; never a response body. */
export interface StepError {
  code: string;
  httpStatus: number | null;
}

export interface AutomationStepRecord {
  status: 'pending' | 'succeeded' | 'failed';
  attempts: number;
  at: Date | null;
  error: StepError | null;
  /** What the step did, in words for the timeline ("Giao cho Thu Hà"), without personal data. */
  summary: string | null;
}

/**
 * A run of an automation for one event, and its place in the queue (ADR-034). `nextAt` is set
 * while the run waits or runs: the due time, a retry, or the end of a running run's lock, so a run
 * an instance left behind is due again. Finished runs have none.
 */
export interface AutomationRunRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  automationId: Types.ObjectId;
  version: number;
  definition: AutomationDefinition;
  eventKey: string;
  event: AutomationEvent;
  contactId: Types.ObjectId | null;
  status: AutomationRunStatus;
  /** Why a run was skipped or stopped: `conditions`, `quota`, `not_new`, `task_done`, `paused`. */
  reason: string | null;
  steps: AutomationStepRecord[];
  nextAt?: Date;
  lockedUntil: Date | null;
  /** The month whose quota it counts in, once its first action started. */
  countedIn: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  expiresAt: Date;
}

const stepSchema = new Schema<AutomationStepRecord>(
  {
    status: { type: String, enum: ['pending', 'succeeded', 'failed'], required: true },
    attempts: { type: Number, required: true, min: 0 },
    at: { type: Date, default: null },
    error: {
      type: new Schema<StepError>(
        { code: { type: String, required: true }, httpStatus: { type: Number, default: null } },
        { _id: false },
      ),
      default: null,
    },
    summary: { type: String, default: null },
  },
  { _id: false },
);

const automationRunSchema = new Schema<AutomationRunRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    automationId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true },
    definition: { type: Schema.Types.Mixed, required: true },
    eventKey: { type: String, required: true },
    event: {
      kind: { type: String, required: true },
      leadId: { type: Schema.Types.ObjectId, default: null },
      opportunityId: { type: Schema.Types.ObjectId, default: null },
      taskId: { type: Schema.Types.ObjectId, default: null },
      stage: { type: String, default: null },
      at: { type: Date, required: true },
    },
    contactId: { type: Schema.Types.ObjectId, default: null },
    status: { type: String, enum: automationRunStatuses, required: true },
    reason: { type: String, default: null },
    steps: { type: [stepSchema], default: [] },
    nextAt: { type: Date },
    lockedUntil: { type: Date, default: null },
    countedIn: { type: String, default: null },
    createdAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'automation_runs', versionKey: false, minimize: false },
);
// One run per automation and event, even when the event comes again (ADR-034).
automationRunSchema.index(
  { automationId: 1, eventKey: 1 },
  { unique: true, name: AUTOMATION_RUN_EVENT_INDEX },
);
// The queue: only runs that wait or run have `nextAt`.
automationRunSchema.index({ nextAt: 1 }, { name: 'automation_runs_due', sparse: true });
// An automation's runs, newest first: its last run, its 30 days, board 27.
automationRunSchema.index(
  { automationId: 1, createdAt: -1, _id: -1 },
  { name: 'automation_runs_automation' },
);
automationRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** The runs a workspace started in one Vietnamese calendar month, as the AI quota (ADR-031). */
export interface AutomationUsageRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  month: string;
  used: number;
  createdAt: Date;
  updatedAt: Date;
}

const automationUsageSchema = new Schema<AutomationUsageRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    month: { type: String, required: true },
    used: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'automation_usage', versionKey: false },
);
automationUsageSchema.index(
  { workspaceId: 1, month: 1 },
  { unique: true, name: AUTOMATION_USAGE_MONTH_INDEX },
);

/** In the workspace's own database (ADR-025). */
export const AUTOMATION_COLLECTION = workspaceCollection(AUTOMATION_MODEL, automationSchema);
export const AUTOMATION_RUN_COLLECTION = workspaceCollection(
  AUTOMATION_RUN_MODEL,
  automationRunSchema,
);
export const AUTOMATION_USAGE_COLLECTION = workspaceCollection(
  AUTOMATION_USAGE_MODEL,
  automationUsageSchema,
);
