/** True for a MongoDB unique-index violation (E11000), optionally on a specific index. */
export function isDuplicateKeyError(error: unknown, indexName?: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) {
    return false;
  }
  if (indexName === undefined) {
    return true;
  }
  return (
    'message' in error && typeof error.message === 'string' && error.message.includes(indexName)
  );
}
