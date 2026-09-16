import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import {
    type DeveloperRuntime,
    resolveProject,
    sshConnections,
    sshExec,
    sshTestConnection,
    sshTunnelClose,
    sshTunnelList,
    sshTunnelOpen,
    runOperation,
} from '@shworks/local-core';

import { safeResult } from '../result.js';

/**
 * 注册 SSH MCP 工具。
 *
 * 设计原则：
 * 1. MCP 请求只引用 .shmcp.yaml（或兼容读取的旧 .devmcp.yaml）中已经声明的命名 profile，不能临时注入 host/key/options；
 * 2. 远程执行采用 program + args，并受 profile.allowedPrograms 白名单约束；
 * 3. TCP tunnel 由 DeveloperRuntime 托管，runtime reset/连接关闭时自动回收；
 * 4. 工具返回永远不包含私钥、环境变量实际值或其他认证 secret。
 */
export function registerSshTools(
    server: McpServer,
    runtime: DeveloperRuntime,
): void {
    server.registerTool(
        'ssh_connections',
        {
            description: '列出项目已配置的 SSH 连接摘要，不返回任何认证凭据',
            inputSchema: z.object({ project: z.string().min(1) }),
        },
        async ({ project }) => safeResult(
            async () => sshConnections(await resolveProject(project)),
            { toolName: 'ssh_connections', params: { project } },
        ),
    );

    server.registerTool(
        'ssh_test_connection',
        {
            description: '使用严格 host-key 校验测试 SSH；返回 { operationId, result }，可用 operation_get 查看安全执行轨迹',
            inputSchema: z.object({
                project: z.string().min(1),
                connection: z.string().min(1),
            }),
        },
        async ({ project, connection }) => safeResult(
            async () => runOperation(
                runtime,
                { tool: 'ssh_test_connection', project },
                async (operation) => {
                    const resolved = await operation.step('resolve_project', () => resolveProject(project), '解析项目与 SSH profile 配置');
                    const result = await operation.step('ssh_connect', () => sshTestConnection(resolved, connection), '执行 Host Key 校验与 SSH 身份认证');
                    return { result, summary: { connection, authType: result.authType, connected: true } };
                },
            ),
            { toolName: 'ssh_test_connection', params: { project, connection } },
        ),
    );

    server.registerTool(
        'ssh_exec',
        {
            description: '通过 SSH 执行白名单远程程序并返回 { operationId, result }；operation_get 提供安全轨迹，远程 stdout/stderr 不复制到 operation_logs',
            inputSchema: z.object({
                project: z.string().min(1),
                connection: z.string().min(1),
                program: z.string().min(1),
                args: z.array(z.string()).max(100).default([]),
                timeoutMs: z.number().int().positive().max(120_000).default(30_000),
            }),
        },
        async ({ project, connection, program, args, timeoutMs }) => safeResult(
            async () => runOperation(
                runtime,
                { tool: 'ssh_exec', project },
                async (operation) => {
                    const resolved = await operation.step('resolve_project', () => resolveProject(project), '解析项目与 SSH profile 配置');
                    const result = await operation.step('ssh_exec', () => sshExec(
                        resolved,
                        connection,
                        program,
                        args,
                        timeoutMs,
                    ), `执行白名单远程程序 ${program}`);
                    // stdout/stderr 属于远程业务输出，不复制到 Operation logs，避免敏感数据二次留存。
                    return { result, summary: { connection, program, argCount: args.length, code: result.code, timedOut: result.timedOut } };
                },
            ),
            {
                toolName: 'ssh_exec',
                // 不把远程 argv 写入通用工具日志。参数可能包含业务数据甚至临时 token；
                // 审计只记录程序名和参数数量，既保留可观测性又降低敏感信息泄露风险。
                params: { project, connection, program, argCount: args.length, timeoutMs },
            },
        ),
    );

    server.registerTool(
        'ssh_tunnel_open',
        {
            description: '通过命名 SSH profile 建立仅绑定 127.0.0.1 的 TCP 隧道，供数据库等上层能力复用',
            inputSchema: z.object({
                project: z.string().min(1),
                connection: z.string().min(1),
                // 0 表示请求操作系统分配临时 loopback 端口，避免调用方自行猜测空闲端口。
                localPort: z.number().int().min(0).max(65535),
                remoteHost: z.string().min(1),
                remotePort: z.number().int().min(1).max(65535),
            }),
        },
        async ({ project, connection, localPort, remoteHost, remotePort }) => safeResult(
            async () => runOperation(
                runtime,
                { tool: 'ssh_tunnel_open', project },
                async (operation) => {
                    const resolved = await operation.step('resolve_project', () => resolveProject(project), '解析项目与 SSH profile 配置');
                    const result = await operation.step('ssh_tunnel_open', () => sshTunnelOpen(
                        runtime,
                        resolved,
                        connection,
                        localPort,
                        remoteHost,
                        remotePort,
                    ), '建立仅监听 127.0.0.1 的 SSH TCP forwarding');
                    return { result, summary: { connection, localPort: result.localPort, remotePort } };
                },
            ),
            {
                toolName: 'ssh_tunnel_open',
                params: { project, connection, localPort, remoteHost, remotePort },
            },
        ),
    );

    server.registerTool(
        'ssh_tunnel_list',
        {
            description: '列出当前 Developer Runtime 中由该项目创建的 SSH 隧道',
            inputSchema: z.object({ project: z.string().min(1) }),
        },
        async ({ project }) => safeResult(
            async () => sshTunnelList(runtime, await resolveProject(project)),
            { toolName: 'ssh_tunnel_list', params: { project } },
        ),
    );

    server.registerTool(
        'ssh_tunnel_close',
        {
            description: '关闭当前 Developer Runtime 中指定的 SSH 隧道',
            inputSchema: z.object({
                project: z.string().min(1),
                id: z.string().uuid(),
            }),
        },
        async ({ project, id }) => safeResult(
            async () => sshTunnelClose(runtime, await resolveProject(project), id),
            { toolName: 'ssh_tunnel_close', params: { project, id } },
        ),
    );
}
