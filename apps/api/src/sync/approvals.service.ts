import { Injectable } from '@nestjs/common';
import type { Approval, SyncOperation } from '@ros/contracts';
import type { Tx } from '../prisma/prisma.service';
import type { DeviceContext } from '../common/auth-context';
import { PermanentRejection } from './sync.errors';

/**
 * Records a manager approval made on the POS with a PIN. The approval already happened offline (ADR-0011),
 * so it is always stored; `authorised` says whether the approver — by the server's current data — is active,
 * works at this branch and holds `permission`. Callers flag `permission_outdated` when it is false.
 */
@Injectable()
export class ApprovalsService {
  async record(
    tx: Tx,
    device: DeviceContext,
    op: SyncOperation,
    approval: Approval,
    permission: string,
    subject: { type: string; id: string },
  ): Promise<boolean> {
    const approver = await tx.employee.findUnique({
      where: { id: approval.approverEmployeeId },
      include: { branches: true },
    });
    if (!approver)
      throw new PermanentRejection('unknown_reference', { approverEmployeeId: approval.approverEmployeeId });
    const holds = await tx.rolePermission.count({ where: { roleId: approver.roleId, permissionKey: permission } });
    const authorised =
      approver.status === 'active' && approver.branches.some((b) => b.branchId === device.branchId) && holds > 0;
    await tx.approval.create({
      data: {
        id: approval.id,
        tenantId: device.tenantId,
        action: approval.action,
        approverEmployeeId: approver.id,
        subjectType: subject.type,
        subjectId: subject.id,
        occurredAt: new Date(approval.occurredAt),
        deviceId: device.deviceId,
        operationId: op.operation_id,
        authorised,
      },
    });
    return authorised;
  }
}
