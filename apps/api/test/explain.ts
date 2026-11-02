import type { Connection, mongo } from 'mongoose';
import { z } from 'zod';

/** A `findOne` as Mongoose hands it to the driver (the connection's `operation-start` event). */
export interface FindOneCall {
  collectionName: string;
  method: string;
  params: [filter: mongo.Filter<mongo.Document>, options: mongo.FindOptions];
}

/** What the index checks read from the explain output of a find. */
const explainedFindSchema = z.object({
  queryPlanner: z.object({ winningPlan: z.unknown() }),
  executionStats: z.object({ totalKeysExamined: z.number(), totalDocsExamined: z.number() }),
});

export type ExplainedFind = z.infer<typeof explainedFindSchema>;

/**
 * The driver calls `run` makes on `collectionName`, exactly as sent. Checking these rather than a
 * filter rebuilt by the test catches a repository that stops sending what the index needs.
 */
export async function recordCalls(
  connection: Connection,
  collectionName: string,
  run: () => Promise<void>,
): Promise<FindOneCall[]> {
  const sent: FindOneCall[] = [];
  const record = (call: FindOneCall): void => {
    if (call.collectionName === collectionName) {
      sent.push(call);
    }
  };
  connection.on('operation-start', record);
  try {
    await run();
  } finally {
    connection.off('operation-start', record);
  }
  return sent;
}

/** Explains a recorded `findOne` as the server runs it. */
export async function explainFindOne(
  connection: Connection,
  call: FindOneCall,
): Promise<ExplainedFind> {
  const [filter, options] = call.params;
  return explainedFindSchema.parse(
    await connection
      .collection(call.collectionName)
      .find(filter, options)
      .limit(1)
      .explain('executionStats'),
  );
}

/** A recorded `aggregate`: the pipeline and the options it was sent with. */
const aggregateCallSchema = z.tuple([
  z.array(z.record(z.string(), z.unknown())),
  z.record(z.string(), z.unknown()).optional(),
]);

/** What the index checks read from the explain output of an aggregation. */
export interface ExplainedAggregate {
  /** The indexes the winning plan scans, each once. */
  indexes: string[];
  /** Documents the winning plan read (`executionStats.totalDocsExamined`). */
  docsExamined: number;
}

/**
 * Explains a recorded `aggregate` as the server runs it. The slot-based engine reports the plan at
 * the top and the classic one under `$cursor`, so the whole output is searched, except the plans
 * the server rejected.
 */
export async function explainAggregate(
  connection: Connection,
  call: FindOneCall,
): Promise<ExplainedAggregate> {
  const [pipeline] = aggregateCallSchema.parse(call.params);
  const explained: unknown = await connection
    .collection(call.collectionName)
    .aggregate(pipeline)
    .explain('executionStats');
  const indexes = new Set<string>();
  const docCounts: number[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object' || value === null) {
      return;
    }
    if ('stage' in value && value.stage === 'IXSCAN' && 'indexName' in value) {
      indexes.add(String(value.indexName));
    }
    if ('totalDocsExamined' in value && typeof value.totalDocsExamined === 'number') {
      docCounts.push(value.totalDocsExamined);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'rejectedPlans') {
        visit(child);
      }
    }
  };
  visit(explained);
  // A count of zero must come from the server, not from an output this helper misread.
  if (docCounts.length === 0) {
    throw new Error('The explain output of the aggregation reports no documents examined');
  }
  return {
    indexes: [...indexes],
    docsExamined: docCounts.reduce((sum, count) => sum + count, 0),
  };
}

/**
 * The indexes a chain of plan stages scans, in plan order. Branches (`inputStages`, as for `$or`)
 * are not followed: a branching plan reports none of their indexes and fails an exact expectation.
 */
export function indexScans(stage: unknown): string[] {
  if (typeof stage !== 'object' || stage === null) {
    return [];
  }
  const own =
    'stage' in stage &&
    stage.stage === 'IXSCAN' &&
    'indexName' in stage &&
    typeof stage.indexName === 'string'
      ? [stage.indexName]
      : [];
  // The slot-based engine nests the query plan one level down.
  const input =
    'queryPlan' in stage ? stage.queryPlan : 'inputStage' in stage ? stage.inputStage : null;
  return [...own, ...indexScans(input)];
}
