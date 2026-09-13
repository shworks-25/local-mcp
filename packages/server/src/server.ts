import {
    McpServer,
} from '@modelcontextprotocol/server';

import {
    serveStdio,
} from '@modelcontextprotocol/server/stdio';

import {
    logger,
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
    McpServer,
} from '@modelcontextprotocol/server';

import {
    serveStdio,
} from '@modelcontextprotocol/server/stdio';

import {
    logger,
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


/**
 * 创建新的 MCP Server。
 *
 * 注意：
 * 这里必须每次创建一个新的 McpServer。
 *
 * 原因：
 * - STDIO：每个连接创建一个 Server
 * - HTTP：createMcpHandler 会按请求创建 Server
 *
 * 不要将 McpServer 做成全局单例。
 */
export function buildServer(): McpServer {
    const server = new McpServer({
        name: 'shworks-devkit',
        version: '0.1.0',
    });

    registerProjectTools(server);
    registerFileTools(server);
    registerGitTools(server);
    registerShellTools(server);

    return server;
}


/**
 * STDIO 模式。
 *
 * 给：
 * - Codex
 * - MCP Inspector STDIO
 * - 其他本地 MCP Client
 *
 * 使用。
 */
export function startStdioServer(): void {
    void serveStdio(
        buildServer,
    );

    /*
     * Pino 已经配置到 stderr，
     * 不会污染 MCP stdout。
     */
    logger.info(
        'shworks-devkit MCP server started',
    );
}
