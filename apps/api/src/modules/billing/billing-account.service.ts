import { Injectable } from '@nestjs/common';
import {
  type BillingInfo,
  type BillingInfoResponse,
  METHOD_SETUP_RESULT_PARAM,
  type MethodSetupResponse,
  type MethodSetupResult,
  type MethodSetupReturnTarget,
  type PaymentMethodResponse,
  type StartMethodSetupRequest,
} from '@plp/contracts';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspaceLinks } from '../workspaces/workspace-links.js';
import { BillingClock } from './billing-clock.js';
import { toPaymentMethodView } from './billing-dto.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { methodSetupReference } from './domain/billing-references.js';
import { EntitlementsService } from './entitlements.service.js';
import { PaymentGateway } from './gateway/payment-gateway.js';
import { paymentsDisabled } from './payment-problems.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** The admin screens the gateway's page leads back to (ADR-035): board 29, or board 28. */
function returnPath(workspaceId: string, target: MethodSetupReturnTarget): string {
  const billing = `/workspaces/${encodeURIComponent(workspaceId)}/billing`;
  return target === 'payments' ? `${billing}/payments` : billing;
}

function returnUrl(
  origin: string,
  workspaceId: string,
  target: MethodSetupReturnTarget,
  result: MethodSetupResult,
): string {
  const url = new URL(returnPath(workspaceId, target), origin);
  url.searchParams.set(METHOD_SETUP_RESULT_PARAM, result);
  return url.toString();
}

/**
 * Board 29's card and billing info (ADR-035), for the owner only (`billing.manage`), also in a
 * read-only workspace. The card itself is saved on the gateway's page; its event stores it.
 */
@Injectable()
export class BillingAccountService {
  constructor(
    private readonly access: AccessService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly log: BillingLogRepository,
    private readonly gateway: PaymentGateway,
    private readonly links: WorkspaceLinks,
    private readonly clock: BillingClock,
    private readonly transactions: TransactionRunner,
  ) {}

  async paymentMethod(
    user: AuthenticatedUser,
    workspaceId: string,
  ): Promise<PaymentMethodResponse> {
    const scope = await this.ownerScope(user, workspaceId);
    const { facts, at } = await this.entitlements.of(scope);
    return {
      paymentMethod: toPaymentMethodView(facts.paymentMethod, at),
      paymentsEnabled: this.gateway.provider !== 'none',
    };
  }

  /**
   * The gateway's page that saves a card. Its reference names the workspace and the owner, which
   * the `method_saved` event echoes back; the return addresses are the workspace's admin, never an
   * address from the request.
   */
  async startMethodSetup(
    user: AuthenticatedUser,
    workspaceId: string,
    request: StartMethodSetupRequest,
  ): Promise<MethodSetupResponse> {
    const scope = await this.ownerScope(user, workspaceId);
    if (this.gateway.provider === 'none') {
      throw paymentsDisabled();
    }
    const origin = await this.links.originOf(scope.workspaceId);
    const id = scope.workspaceId.toHexString();
    return this.gateway.startMethodSetup({
      reference: methodSetupReference(scope.workspaceId, scope.userId),
      returnUrl: returnUrl(origin, id, request.returnTo, 'saved'),
      cancelUrl: returnUrl(origin, id, request.returnTo, 'canceled'),
    });
  }

  async billingInfo(user: AuthenticatedUser, workspaceId: string): Promise<BillingInfoResponse> {
    const scope = await this.ownerScope(user, workspaceId);
    const { facts } = await this.entitlements.of(scope);
    return { billingInfo: facts.billingInfo };
  }

  /** Later invoices copy it; issued ones keep theirs (ADR-035). Logged without its content. */
  async updateBillingInfo(
    user: AuthenticatedUser,
    workspaceId: string,
    info: BillingInfo,
  ): Promise<BillingInfoResponse> {
    const scope = await this.ownerScope(user, workspaceId);
    const at = this.clock.now();
    await this.transactions.run(async (tx) => {
      if (!(await this.subscriptions.setBillingInfo(scope, info, at, tx))) {
        throw new Error(
          `Workspace ${scope.workspaceId.toHexString()} has no subscription (ADR-035)`,
        );
      }
      await this.log.record(
        scope,
        { at, actorId: scope.userId, action: 'billing_info_changed' },
        tx,
      );
    });
    return { billingInfo: info };
  }

  private async ownerScope(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    return scope;
  }
}
