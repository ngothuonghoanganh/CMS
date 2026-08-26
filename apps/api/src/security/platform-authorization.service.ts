import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  PlatformPermissionSchema,
  PlatformPermissions,
  type AuthPrincipal,
  type PlatformPermission,
} from '@payload/contracts';

import { PlatformUserRecord } from '../tenancy/schemas/platform-user.schema';
import { PlatformRoleRecord } from '../tenancy/schemas/platform-role.schema';
import { PlatformRoleAssignmentRecord } from '../tenancy/schemas/platform-role-assignment.schema';
import { MASTER_CONNECTION } from '../tenancy/master-connection';
import { randomUUID } from 'node:crypto';

const allPlatformPermissions = Object.values(PlatformPermissions);

@Injectable()
export class PlatformAuthorizationService {
  private seeded: Promise<void> | null = null;

  constructor(
    @InjectModel(PlatformUserRecord.name, MASTER_CONNECTION)
    private readonly userModel: Model<PlatformUserRecord>,
    @InjectModel(PlatformRoleRecord.name, MASTER_CONNECTION)
    private readonly roleModel: Model<PlatformRoleRecord>,
    @InjectModel(PlatformRoleAssignmentRecord.name, MASTER_CONNECTION)
    private readonly assignmentModel: Model<PlatformRoleAssignmentRecord>,
  ) {}

  async ensureSeeded(): Promise<void> {
    if (!this.seeded) {
      this.seeded = this.roleModel
        .updateOne(
          { key: 'platform-admin' },
          {
            $setOnInsert: {
              _id: randomUUID(),
              key: 'platform-admin',
              name: 'Platform administrator',
              permissions: allPlatformPermissions,
            },
          },
          { upsert: true, setDefaultsOnInsert: true },
        )
        .exec()
        .then(() => undefined)
        .catch((error) => {
          this.seeded = null;
          throw error;
        });
    }
    await this.seeded;
  }

  async can(
    principal: AuthPrincipal | undefined,
    permission: PlatformPermission,
  ): Promise<boolean> {
    if (!principal?.subject) return false;
    await this.ensureSeeded();
    const user = await this.userModel
      .findOne({ email: principal.subject.toLowerCase(), status: 'active' })
      .exec();
    if (!user) return false;
    const assignments = await this.assignmentModel
      .find({ platformUserId: user._id.toString() })
      .exec();
    const roleIds = assignments.map((assignment) => assignment.roleId);
    const roles = await this.roleModel.find({ _id: { $in: roleIds } }).exec();
    const permissions = new Set(
      roles.flatMap((role) =>
        role.permissions.filter(
          (candidate) => PlatformPermissionSchema.safeParse(candidate).success,
        ),
      ),
    );
    // `role` is retained as a Phase 10 compatibility fallback for an existing
    // bootstrap record that predates platform role assignments.
    return (
      user.role === 'platform-admin' &&
      (permissions.has(permission) || assignments.length === 0)
    );
  }

  async assertCan(
    principal: AuthPrincipal | undefined,
    permission: PlatformPermission,
  ): Promise<void> {
    if (!(await this.can(principal, permission))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }
  }
}
