import {
    readFileSync,
} from 'node:fs';

import {
    McpServer,
} from '@modelcontextprotocol/server';

import {
    serveStdio,
} from '@modelcontextprotocol/server/stdio';

import {
    DeveloperRuntime,
    getLogger,
} from '@shworks/local-core';

import {
    registerProjectTools,
} from './tools/project.js';

import {
    registerFileTools,
} from './tools/files.js';

import {
    registerGitTools,
} from './tools/git.js';

import {
    registerShellTools,
} from './tools/shell.js';

import {
    registerDeveloperTools,
} from './tools/developer.js';

import {
    registerSshTools,
} from './tools/ssh.js';

const packageVersion = (
    JSON.parse(
        readFileSync(
            new URL('../package.json', import.meta.url),
            'utf8',
        ),
    ) as { version: string }
).version;

const serverLogger =
    getLogger('mcp:server');

/**
 * 安装 STDIO 标准输出防护拦截。
 *
 * 核心目的：
 * MCP 协议规范严格要求 stdout 作为 JSON-RPC 协议消息的专有通道。
 * 本防护将 console.log 等无意输出的标准流重定向至 stderr，
 * 杜绝第三方库或调试代码无意破坏客户端通信协议。
 */
function installStdioGuard(): void {
    const originalLog = console.log;
    const originalInfo = console.info;

    console.log = (...args: unknown[]) => {
        console.error('[UNGUARDED_STDOUT_REDIRECT]', ...args);
    };

    console.info = (...args: unknown[]) => {
        console.error('[UNGUARDED_STDOUT_REDIRECT]', ...args);
    };

    void originalLog;
    void originalInfo;
}

/**
 * 创建新的 MCP Server 实例。
 *
 * 核心契约：
 * 每次调用均返回全新的独立 McpServer 实例，满足不同连接或请求的隔离要求，
 * 避免将 McpServer 作为全局单例使用带来的并发污染。
 */
export function buildServer(
    runtime = new DeveloperRuntime(),
): McpServer {
    const server = new McpServer({
        name: 'shworks-devkit',
        version: packageVersion,
    });

    registerProjectTools(server);
    registerFileTools(server);
    registerGitTools(server);
    registerShellTools(server);
    registerSshTools(server, runtime);
    registerDeveloperTools(
        server,
        runtime,
    );

    return server;
}

/**
 * 启动 STDIO 模式的 MCP 服务。
 *
 * 核心目的：
 * 面向本地接入的 MCP Client（如 Codex、Claude Desktop、MCP Inspector）提供标准输入输出通讯，
 * 同时预先挂载输出通道安全防护与生命周期就绪日志。
 */
export async function startStdioServer(): Promise<void> {
    installStdioGuard();

    const runtime = new DeveloperRuntime();

    try {
        await serveStdio(
            () => buildServer(runtime),
        );

        serverLogger.info(
            'shworks-devkit MCP stdio server started',
        );
    } finally {
        await runtime.reset();
    }
}
