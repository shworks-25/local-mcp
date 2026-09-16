import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import {
    type DeveloperRuntime,
    operationGet,
    operationList,
    operationLogs,
} from '@shworks/local-core';

import { safeResult } from '../result.js';

/**
 * Operation 查询工具只暴露受控的执行审计信息，不包含模型内部推理。
 * 第一阶段保持纯内存、runtime-scoped；runtime_reset 后记录自然清除。
 */
export function registerOperationTools(
    server: McpServer,
    runtime: DeveloperRuntime,
): void {
    server.registerTool(
        'operation_list',
        {
            description: '查看当前 Developer Runtime 最近的本机工具执行记录与步骤状态',
            inputSchema: z.object({
                project: z.string().min(1).optional(),
                limit: z.number().int().min(1).max(100).default(20),
            }),
        },
        async ({ project, limit }) => safeResult(
            async () => operationList(runtime, project, limit),
            { toolName: 'operation_list', params: { project, limit } },
        ),
    );

    server.registerTool(
        'operation_logs',
        {
            description: '增量读取指定 Operation 的有界执行日志；返回 nextAfter/truncated，客户端可据此安全分页并识别已淘汰日志',
            inputSchema: z.object({
                id: z.string().min(1),
                after: z.number().int().min(0).default(0),
            }),
        },
        async ({ id, after }) => safeResult(
            async () => operationLogs(runtime, id, after),
            { toolName: 'operation_logs', params: { id, after } },
        ),
    );

    server.registerTool(
        'operation_get',
        {
            description: '查看指定 Operation 的安全执行轨迹、步骤耗时和失败位置；不返回长日志，日志请使用 operation_logs',
            inputSchema: z.object({ id: z.string().min(1) }),
        },
        async ({ id }) => safeResult(
            async () => operationGet(runtime, id),
            { toolName: 'operation_get', params: { id } },
        ),
    );
}
