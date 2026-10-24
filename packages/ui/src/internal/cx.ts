/** Joins class names, skipping empty values. CSS Module classes are typed `string | undefined`. */
export function cx(...classes: ReadonlyArray<string | false | null | undefined>): string {
  return classes
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' ');
}
