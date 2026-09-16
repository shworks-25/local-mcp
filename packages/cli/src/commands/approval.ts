import type { Command } from 'commander';

import {
    DeveloperRuntime,
    approveTicket,
    getApprovalTicket,
    listApprovalTickets,
    rejectTicket,
} from '@shworks/local-core';

/**
 * CLI 审批入口。
 *
 * 设计原则：
 * - Approval 不通过 MCP Tool 暴露，避免模型自我批准。
 * - CLI 作为可信人工入口完成 approve/reject。
 * - 当前使用进程内 Runtime，后续可替换为持久化 ApprovalStore。
 */
const runtime = new DeveloperRuntime();

export function registerApprovalCommands(program: Command): void {
    const command = program
        .command('approval')
        .description('管理高风险操作审批');

    command
        .command('list')
        .description('查看待审批任务')
        .action(() => {
            console.log(JSON.stringify(listApprovalTickets(runtime), null, 2));
        });

    command
        .command('get')
        .argument('<ticketId>')
        .description('查看审批详情')
        .action((ticketId: string) => {
            console.log(JSON.stringify(getApprovalTicket(runtime, ticketId), null, 2));
        });

    command
        .command('approve')
        .argument('<ticketId>')
        .description('批准审批任务')
        .action((ticketId: string) => {
            console.log(JSON.stringify(approveTicket(runtime, ticketId), null, 2));
        });

    command
        .command('reject')
        .argument('<ticketId>')
        .description('拒绝审批任务')
        .action((ticketId: string) => {
            console.log(JSON.stringify(rejectTicket(runtime, ticketId), null, 2));
        });
}
