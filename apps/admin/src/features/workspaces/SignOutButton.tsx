'use client';

import { Button, type ButtonVariant } from '@plp/ui';
import type { ReactNode } from 'react';
import { useLogout } from '../shell/use-logout';

/** "Đăng xuất" on a page without the sidebar; the login page opens once the session ended. */
export function SignOutButton({
  variant = 'secondary',
  children = 'Đăng xuất',
}: {
  variant?: ButtonVariant;
  children?: ReactNode;
}) {
  const logout = useLogout();
  return (
    <Button
      type="button"
      variant={variant}
      loading={logout.isPending}
      onClick={() => {
        void logout.signOut();
      }}
    >
      {children}
    </Button>
  );
}
