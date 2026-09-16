import { randomUUID } from 'node:crypto';

import type { DeveloperRuntime } from '../runtime/developer-runtime.js';

export type ApprovalStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'expired'
    | 'consumed';

export interface ApprovalTicket {
    id: string;
    operationId?: string;
    project?: string;
    action: string;
    summary: string;
    digest: string;
    status: ApprovalStatus;
    createdAt: string;
    updatedAt: string;
}

interface ApprovalStore {
    tickets: Map<string, ApprovalTicket>;
}

const STORE_KEY = 'approval_tickets';

function storeFor(runtime: DeveloperRuntime): ApprovalStore {
    return runtime.getStore(STORE_KEY, () => ({ tickets: new Map() }));
}

function timestamp(): string {
    return new Date().toISOString();
}

export function createApprovalTicket(
    runtime: DeveloperRuntime,
    input: Omit<ApprovalTicket, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
): ApprovalTicket {
    const ticket: ApprovalTicket = {
        ...input,
        id: `approval_${randomUUID()}`,
        status: 'pending',
        createdAt: timestamp(),
        updatedAt: timestamp(),
    };

    storeFor(runtime).tickets.set(ticket.id, ticket);
    return ticket;
}

export function getApprovalTicket(runtime: DeveloperRuntime, id: string): ApprovalTicket {
    const ticket = storeFor(runtime).tickets.get(id);
    if (!ticket) {
        throw new Error('Approval ticket 不存在或已过期');
    }
    return ticket;
}

export function approveTicket(runtime: DeveloperRuntime, id: string): ApprovalTicket {
    const ticket = getApprovalTicket(runtime, id);
    if (ticket.status !== 'pending') {
        throw new Error('Approval ticket 当前状态不可批准');
    }
    ticket.status = 'approved';
    ticket.updatedAt = timestamp();
    return ticket;
}

export function rejectTicket(runtime: DeveloperRuntime, id: string): ApprovalTicket {
    const ticket = getApprovalTicket(runtime, id);
    if (ticket.status !== 'pending') {
        throw new Error('Approval ticket 当前状态不可拒绝');
    }
    ticket.status = 'rejected';
    ticket.updatedAt = timestamp();
    return ticket;
}

export function listApprovalTickets(runtime: DeveloperRuntime): ApprovalTicket[] {
    return [...storeFor(runtime).tickets.values()];
}

export function consumeApprovalTicket(
    runtime: DeveloperRuntime,
    id: string,
    digest: string,
): ApprovalTicket {
    const ticket = getApprovalTicket(runtime, id);

    if (ticket.status !== 'approved') {
        throw new Error('Approval ticket 未批准');
    }

    if (ticket.digest !== digest) {
        throw new Error('Approval digest 不匹配，拒绝执行');
    }

    ticket.status = 'consumed';
    ticket.updatedAt = timestamp();
    return ticket;
}
