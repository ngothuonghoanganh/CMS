'use client';

import type { FieldDescriptor } from '@plp/sections/schema';
import type { ControlProps } from './field-shared';
import { LeafControl } from './LeafControl';
import { ListControl } from './ListControl';

/** The official editor of one field of a section, generated from its descriptor. */
export function FieldControl({ section, field, path }: ControlProps<FieldDescriptor>) {
  return field.kind === 'list' ? (
    <ListControl section={section} field={field} path={path} />
  ) : (
    <LeafControl section={section} field={field} path={path} />
  );
}
