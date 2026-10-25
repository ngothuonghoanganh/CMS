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
