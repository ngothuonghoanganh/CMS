import { ConflictException } from '@nestjs/common';

export function assertExpectedVersionNumber(
  expectedVersionNumber: number | undefined,
  currentVersionNumber: number,
): void {
  if (
    expectedVersionNumber !== undefined &&
    expectedVersionNumber !== currentVersionNumber
  ) {
    throw new ConflictException({
      code: 'PAGE_VERSION_CONFLICT',
      message: `Expected page version ${expectedVersionNumber}, current version is ${currentVersionNumber}`,
    });
  }
}

export function nextVersionNumber(currentVersionNumber: number | undefined): number {
  return (currentVersionNumber ?? 0) + 1;
}
