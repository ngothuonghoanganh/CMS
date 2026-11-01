'use client';

import {
  endpoints,
  INVITATION_PATH,
  type InvitationLookupResponse,
  type InvitedSignupRequest,
  invitedSignupRequestSchema,
  accessLabel,
} from '@plp/contracts';
import { Button, ButtonLink, Callout, Field, Input, Spinner } from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useState, useSyncExternalStore } from 'react';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { loadPage } from '../../lib/page-load';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useSchemaForm } from '../shell/use-schema-form';
import { workspacePreferenceCookie } from '../shell/workspace-preference';
import { accessDescription } from './member-presentation';
import styles from './InvitationPage.module.css';
import { type WorkspaceAddresses, workspaceHome } from '../shell/admin-address';

/** Keeps the link's secret across signing in, which leaves this page (session storage only). */
export const PENDING_INVITATION_KEY = 'plp_invitation';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

/** The secret from `#token=…`, or the one kept while signing in; it never reaches a server log. */
function currentToken(): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (fromHash !== null && fromHash !== '') {
    return fromHash;
  }
  try {
    return window.sessionStorage.getItem(PENDING_INVITATION_KEY);
  } catch {
    // Storage is blocked: the link in the email still works.
    return null;
  }
}

function keepToken(token: string): void {
  try {
    window.sessionStorage.setItem(PENDING_INVITATION_KEY, token);
  } catch (error) {
    console.warn('The invitation could not be kept while signing in', error);
  }
}

function forgetToken(): void {
  try {
    window.sessionStorage.removeItem(PENDING_INVITATION_KEY);
  } catch (error) {
    console.warn('The kept invitation could not be dropped', error);
  }
}

/**
 * Opens the workspace the user just joined, with a page load so no other cache stays: at its own
 * address when workspaces have one (ADR-025), else at the one address, remembered as chosen.
 */
function openWorkspace(
  workspace: { id: string; slug: string },
  addresses: WorkspaceAddresses | null,
): void {
  forgetToken();
  if (addresses !== null) {
    loadPage(`${workspaceHome(addresses, workspace.slug)}/`);
    return;
  }
  document.cookie = workspacePreferenceCookie(workspace.id);
  loadPage('/');
}

const fieldIds = { name: 'invite-name', password: 'invite-password' } as const;

function SignupForm({
  token,
  invitation,
  addresses,
}: {
  token: string;
  invitation: InvitationLookupResponse;
  addresses: WorkspaceAddresses | null;
}) {
  const form = useSchemaForm(invitedSignupRequestSchema.omit({ token: true }), {
    name: '',
    password: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const signup = useMutation({
    mutationFn: (body: InvitedSignupRequest) => api(endpoints.signupInvited, [], { body }),
    onSuccess: (me) => {
      const joined = me.memberships[0];
      if (joined !== undefined) {
        openWorkspace(joined.workspace, addresses);
      }
    },
    onError: (error) => {
      reportUnexpected('Signing up from an invitation failed', error);
      const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      if (Object.keys(fieldErrors).length > 0) {
        form.setServerErrors(fieldErrors);
        return;
      }
      setFormError(problemMessage(error));
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const result = form.validate();
    if (!result.ok) {
      document.getElementById(fieldIds[result.errors.name ? 'name' : 'password'])?.focus();
      return;
    }
    signup.mutate({ token, ...result.data });
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <h1 className={styles.title}>Tạo tài khoản để tham gia</h1>
      <Field label="Email" id="invite-email" help="Lời mời gắn với email này.">
        <Input type="email" value={invitation.email} readOnly />
      </Field>
      <Field label="Họ và tên" id={fieldIds.name} error={form.errors.name}>
        <Input
          type="text"
          autoComplete="name"
          value={form.values.name}
          onChange={(event) => {
            form.setValue('name', event.target.value);
          }}
        />
      </Field>
      <Field
        label="Mật khẩu"
        id={fieldIds.password}
        help="Ít nhất 8 ký tự."
        error={form.errors.password}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={form.values.password}
          onChange={(event) => {
            form.setValue('password', event.target.value);
          }}
        />
      </Field>
      {formError === null ? null : (
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      )}
      <Button type="submit" fullWidth loading={signup.isPending}>
        Tạo tài khoản và tham gia
      </Button>
    </form>
  );
}

/** Board 15b: whoever opens an invitation link joins, signs up, or learns why they cannot. */
export interface InvitationPageProps {
  /** How workspace addresses are made (ADR-025); null when every workspace opens at one address. */
  addresses: WorkspaceAddresses | null;
}

export function InvitationPage({ addresses }: InvitationPageProps) {
  const queryClient = useQueryClient();
  // Undefined while rendering on the server, where there is no fragment.
  const token = useSyncExternalStore(subscribe, currentToken, () => undefined);
  const lookup = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api(endpoints.lookupInvitation, [], { body: { token: token ?? '' } }),
    enabled: typeof token === 'string',
    retry: false,
  });
  const me = useQuery({
    queryKey: ['invitation', 'me'],
    queryFn: async () => {
      try {
        return await api(endpoints.me, []);
      } catch (error) {
        // Not signed in: the page offers to sign up or log in.
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
  });
  const accept = useMutation({
    mutationFn: (secret: string) =>
      api(endpoints.acceptInvitation, [], { body: { token: secret } }),
    onSuccess: (result) => {
      openWorkspace({ id: result.workspaceId, slug: result.slug }, addresses);
    },
    onError: (error) => {
      reportUnexpected('Accepting an invitation failed', error);
    },
  });
  const decline = useMutation({
    mutationFn: (secret: string) =>
      api(endpoints.declineInvitation, [], { body: { token: secret } }),
    onSuccess: () => {
      forgetToken();
      void queryClient.invalidateQueries({ queryKey: ['invitation'] });
    },
    onError: (error) => {
      reportUnexpected('Declining an invitation failed', error);
    },
  });
  const logout = useMutation({
    mutationFn: () => api(endpoints.logout, []),
    onSuccess: () => {
      queryClient.setQueryData(['invitation', 'me'], null);
    },
    onError: (error) => {
      reportUnexpected('Signing out from the invitation page failed', error);
    },
  });

  if (token === undefined || (typeof token === 'string' && (lookup.isPending || me.isPending))) {
    return <Spinner label="Đang mở lời mời" />;
  }
  if (token === null || lookup.isError || me.isError) {
    const problem = lookup.error ?? me.error;
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>Liên kết mời không hợp lệ</h1>
        <p className={styles.text}>
          {problem === null
            ? 'Mở lại liên kết trong email mời, hoặc nhờ người mời gửi lại.'
            : problemMessage(problem)}
        </p>
      </div>
    );
  }
  const invitation = lookup.data;
  const user = me.data;
  if (invitation === undefined || user === undefined) {
    return null;
  }

  const header = (
    <div className={styles.header}>
      <span className={styles.invitedBy}>{invitation.invitedByName} mời bạn vào</span>
      <span className={styles.workspace}>{invitation.workspaceName}</span>
    </div>
  );

  if (invitation.state !== 'pending') {
    const title =
      invitation.state === 'expired'
        ? 'Lời mời đã hết hạn'
        : invitation.state === 'accepted'
          ? 'Lời mời đã được dùng'
          : 'Lời mời không còn hiệu lực';
    const body =
      invitation.state === 'expired'
        ? `Lời mời hết hạn ngày ${formatDate(invitation.expiresAt)}. Hãy nhờ ${invitation.invitedByName} gửi lại; email cũ không còn dùng được.`
        : invitation.state === 'accepted'
          ? `Lời mời này đã được chấp nhận. Nếu đó là bạn, hãy đăng nhập để vào ${invitation.workspaceName}.`
          : `Lời mời đã bị thu hồi hoặc từ chối. Hãy nhờ ${invitation.invitedByName} gửi lời mời mới.`;
    return (
      <div className={styles.card}>
        {header}
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.text}>{body}</p>
        {invitation.state === 'accepted' ? (
          <ButtonLink href="/login" fullWidth>
            Đăng nhập
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  const grant = (
    <div className={styles.grant}>
      <span>
        <strong>{accessLabel(invitation.role)}</strong>{' '}
        {invitation.siteNames === null
          ? 'trên toàn workspace'
          : `trên site ${invitation.siteNames.join(', ')}`}
      </span>
      <span className={styles.muted}>{accessDescription(invitation.role)}</span>
    </div>
  );

  if (user !== null && user.user.email !== invitation.email) {
    return (
      <div className={styles.card}>
        {header}
        <Callout tone="warning" role="alert" title="Lời mời này dành cho email khác">
          Bạn đang đăng nhập bằng <strong>{user.user.email}</strong>. Lời mời được gửi tới{' '}
          <strong>{invitation.email}</strong>.
        </Callout>
        <Button
          fullWidth
          loading={logout.isPending}
          onClick={() => {
            logout.mutate();
          }}
        >
          Đăng xuất và dùng email được mời
        </Button>
        <p className={styles.text}>
          Muốn dùng email hiện tại? Nhờ {invitation.invitedByName} gửi lời mời mới tới{' '}
          {user.user.email}.
        </p>
      </div>
    );
  }

  if (user !== null) {
    const failure = accept.error ?? decline.error;
    return (
      <div className={styles.card}>
        {header}
        {grant}
        <h1 className={styles.title}>Tham gia {invitation.workspaceName}?</h1>
        <p className={styles.text}>
          Bạn đang đăng nhập bằng <strong>{user.user.email}</strong>. Workspace mới sẽ có trong danh
          sách đổi workspace.
        </p>
        {failure === null ? null : (
          <Callout tone="danger" role="alert">
            {problemMessage(failure)}
          </Callout>
        )}
        <Button
          fullWidth
          loading={accept.isPending}
          disabled={decline.isPending}
          onClick={() => {
            accept.mutate(token);
          }}
        >
          Tham gia
        </Button>
        <Button
          variant="ghost"
          fullWidth
          loading={decline.isPending}
          disabled={accept.isPending}
          onClick={() => {
            decline.mutate(token);
          }}
        >
          Từ chối lời mời
        </Button>
      </div>
    );
  }

  if (invitation.accountExists) {
    return (
      <div className={styles.card}>
        {header}
        {grant}
        <h1 className={styles.title}>Đăng nhập để tham gia</h1>
        <p className={styles.text}>
          Email <strong>{invitation.email}</strong> đã có tài khoản. Đăng nhập, rồi bạn quay lại đây
          để tham gia.
        </p>
        <Button
          fullWidth
          onClick={() => {
            keepToken(token);
            loadPage(`/login?next=${encodeURIComponent(INVITATION_PATH)}`);
          }}
        >
          Đăng nhập
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      {header}
      {grant}
      <SignupForm token={token} invitation={invitation} addresses={addresses} />
    </div>
  );
}
