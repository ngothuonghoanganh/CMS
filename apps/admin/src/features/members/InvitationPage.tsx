'use client';

import {
  endpoints,
  INVITATION_PATH,
  INVITATION_VALID_DAYS,
  type InvitationLookupResponse,
  type InvitedSignupRequest,
  invitedSignupRequestSchema,
  accessLabel,
} from '@plp/contracts';
import { Avatar, Button, ButtonLink, Callout, Field, Input, Spinner } from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ReactNode,
  type SubmitEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
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

/**
 * "Nhờ … gửi lại": an email to the inviter, already written, asking for a new link to the same
 * address (ADR-021). Encoded for `mailto:` (RFC 6068): spaces as %20, never "+".
 */
function resendRequestHref(
  invitation: Pick<InvitationLookupResponse, 'workspaceName' | 'invitedByName' | 'email'>,
  inviterEmail: string,
): string {
  const subject = `Nhờ gửi lại lời mời vào ${invitation.workspaceName}`;
  const body = [
    `Chào ${invitation.invitedByName},`,
    '',
    `Lời mời vào ${invitation.workspaceName} gửi tới ${invitation.email} đã hết hạn. Nhờ bạn gửi lại giúp mình.`,
    '',
    'Cảm ơn bạn!',
  ].join('\n');
  return `mailto:${inviterEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
      {/* The account's username: a password manager saves the new password under this email. */}
      <Field label="Email" id="invite-email" help="Lời mời gắn với email này.">
        <Input
          type="email"
          name="email"
          autoComplete="username"
          value={invitation.email}
          readOnly
        />
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

/**
 * The invitation's card, headed by who invites to which workspace, and the line under it for
 * someone who does not know the inviter (board 15b).
 */
function InvitationCard({
  invitation,
  children,
}: {
  invitation: InvitationLookupResponse;
  children: ReactNode;
}) {
  return (
    <>
      <div className={styles.card}>
        <div className={styles.header}>
          <Avatar name={invitation.workspaceName} shape="square" size={44} />
          <div className={styles.headerText}>
            <span className={styles.invitedBy}>{invitation.invitedByName} mời bạn vào</span>
            <span className={styles.workspace}>{invitation.workspaceName}</span>
          </div>
        </div>
        {children}
      </div>
      <p className={styles.footer}>
        Không biết người mời? Bạn có thể bỏ qua email này. Lời mời tự hết hạn sau{' '}
        {INVITATION_VALID_DAYS} ngày.
      </p>
    </>
  );
}

/** Board 15b: whoever opens an invitation link joins, signs up, or learns why they cannot. */
export interface InvitationPageProps {
  /** How workspace addresses are made (ADR-025); null when every workspace opens at one address. */
  addresses: WorkspaceAddresses | null;
}

/**
 * What the signed-in person chose here, with the link they chose on. The kept token is forgotten
 * as they choose, so the page shows this first: read again, it would find no token and call the
 * link invalid.
 */
type Outcome =
  | { kind: 'joining'; token: string; workspaceName: string }
  | { kind: 'declined'; token: string; invitation: InvitationLookupResponse };

export function InvitationPage({ addresses }: InvitationPageProps) {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const outcomeHeading = useRef<HTMLHeadingElement>(null);
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
    mutationFn: ({ secret }: { secret: string; invitation: InvitationLookupResponse }) =>
      api(endpoints.acceptInvitation, [], { body: { token: secret } }),
    onSuccess: (result, { secret, invitation }) => {
      setOutcome({ kind: 'joining', token: secret, workspaceName: invitation.workspaceName });
      openWorkspace({ id: result.workspaceId, slug: result.slug }, addresses);
    },
    onError: (error) => {
      reportUnexpected('Accepting an invitation failed', error);
    },
  });
  const decline = useMutation({
    mutationFn: ({ secret }: { secret: string; invitation: InvitationLookupResponse }) =>
      api(endpoints.declineInvitation, [], { body: { token: secret } }),
    onSuccess: (_result, { secret, invitation }) => {
      setOutcome({ kind: 'declined', token: secret, invitation });
      forgetToken();
    },
    onError: (error) => {
      reportUnexpected('Declining an invitation failed', error);
    },
  });

  // The buttons go with the card they were on: the focus continues from the answer.
  useEffect(() => {
    if (outcome?.kind === 'declined') {
      outcomeHeading.current?.focus();
    }
  }, [outcome]);
  const logout = useMutation({
    mutationFn: () => api(endpoints.logout, []),
    onSuccess: () => {
      queryClient.setQueryData(['invitation', 'me'], null);
    },
    onError: (error) => {
      reportUnexpected('Signing out from the invitation page failed', error);
    },
  });

  // An outcome answers the link it was chosen on. Another link opened in this tab changes only
  // the fragment and shows its own invitation; no token at all is the one just chosen and dropped.
  const answered = outcome !== null && (token === null || token === outcome.token) ? outcome : null;
  if (answered?.kind === 'joining') {
    // The workspace page is loading; nothing else is left to do here.
    return <Spinner label={`Đang mở ${answered.workspaceName}`} />;
  }
  if (answered?.kind === 'declined') {
    const { invitation } = answered;
    return (
      <InvitationCard invitation={invitation}>
        <h1 ref={outcomeHeading} tabIndex={-1} className={styles.title}>
          Bạn đã từ chối lời mời
        </h1>
        <p className={styles.text}>
          Bạn không tham gia {invitation.workspaceName}. Nếu đổi ý, hãy nhờ{' '}
          {invitation.invitedByName} gửi lời mời mới.
        </p>
        {/* Only someone signed in declines: the start page opens their workspaces. */}
        <ButtonLink href="/" variant="secondary" fullWidth>
          Về trang chủ
        </ButtonLink>
      </InvitationCard>
    );
  }
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
      <InvitationCard invitation={invitation}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.text}>{body}</p>
        {invitation.state === 'accepted' ? (
          <ButtonLink href="/login" fullWidth>
            Đăng nhập
          </ButtonLink>
        ) : null}
        {/* The API gives the inviter's email for an expired invitation only (ADR-021). */}
        {invitation.state === 'expired' && invitation.inviterEmail !== null ? (
          <>
            <ButtonLink
              href={resendRequestHref(invitation, invitation.inviterEmail)}
              variant="secondary"
              fullWidth
            >
              Nhờ {invitation.invitedByName} gửi lại
            </ButtonLink>
            {/* Without a mail app the link opens nothing: the address can still be copied. */}
            <p className={styles.text}>
              Email của {invitation.invitedByName}: <strong>{invitation.inviterEmail}</strong>
            </p>
          </>
        ) : null}
      </InvitationCard>
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
      <InvitationCard invitation={invitation}>
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
      </InvitationCard>
    );
  }

  if (user !== null) {
    // Like the outcome, a failure belongs to the link it happened on.
    const failure =
      (accept.variables?.secret === token ? accept.error : null) ??
      (decline.variables?.secret === token ? decline.error : null);
    return (
      <InvitationCard invitation={invitation}>
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
            accept.mutate({ secret: token, invitation });
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
            decline.mutate({ secret: token, invitation });
          }}
        >
          Từ chối lời mời
        </Button>
      </InvitationCard>
    );
  }

  if (invitation.accountExists) {
    return (
      <InvitationCard invitation={invitation}>
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
      </InvitationCard>
    );
  }

  return (
    <InvitationCard invitation={invitation}>
      {grant}
      <SignupForm token={token} invitation={invitation} addresses={addresses} />
    </InvitationCard>
  );
}
