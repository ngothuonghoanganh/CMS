'use client';

import type { ComponentPropsWithRef } from 'react';
import { useEditorServices } from './editor-context';

export type GuardedLinkProps = ComponentPropsWithRef<'a'> & { href: string };

/**
 * A link out of the editor. A plain click goes through the editor's guarded navigation, which
 * asks first when changes are not saved; modified clicks (new tab, new window) work as usual.
 */
export function GuardedLink({ href, onClick, ...rest }: GuardedLinkProps) {
  const { navigate } = useEditorServices();
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        const modified =
          event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (event.defaultPrevented || modified) {
          return;
        }
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}
