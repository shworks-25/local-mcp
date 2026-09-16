import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import {
    DatabaseConnectionRegistry,
    DatabaseConnectionResolver,
    type DeveloperRuntime,
} from '@shworks/local-core';

import { safeResult } from '../result.js';

/**
 * Database Registry MCP 工具。
 *
 * 当前阶段只提供连接声明查询能力。
 * 不建立真实数据库连接，不读取密码环境变量。
 *
 * 目的：
 * - 让 AI 可以发现可用数据库 profile。
 * - 保持 secret 不进入 MCP 返回结果。
 * - 为后续 MySQL/PostgreSQL Adapter 提供稳定入口。
 */
export function registerDatabaseTools(
    server: McpServer,
    runtime: DeveloperRuntime,
): void {
    void runtime;

    server.registerTool(
        'database_connections',
        {
            description: '列出当前项目配置中的数据库连接摘要，不返回密码、token 或其他 secret',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) => safeResult(
            async () => {
                // TODO: 接入 project resolver 后，从项目 .shmcp.yaml 创建 Registry。
                // 当前返回空 Registry，保持 MCP 接口先稳定。
                const registry = new DatabaseConnectionRegistry({
                    connections: {},
                });

                const resolver = new DatabaseConnectionResolver(registry);

                return {
                    project,
                    connections: registry.list(),
                    resolverReady: Boolean(resolver),
                };
            },
            {
                toolName: 'database_connections',
                params: { project },
            },
        ),
    );
}
