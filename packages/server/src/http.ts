import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';

import {
    timingSafeEqual,
} from 'node:crypto';

import {
    createMcpHandler,
} from '@modelcontextprotocol/server';

import {
    toNodeHandler,
} from '@modelcontextprotocol/node';

import {
    getLogger,
} from '@shworks/local-core';

import {
    buildServer,
} from './server.js';

const httpLogger =
    getLogger('mcp:http');

export interface HttpServerOptions {
    host?: string;
    port?: number;

    /**
     * Bearer Token。
     *
     * 如果为空，则不启用 Token 验证。
     *
     * 正式公网环境强烈建议必须配置。
     */
    authToken?: string;
}

/**
 * 安全比较两个字符串。
 *
 * 避免简单 === 可能产生的时序差异。
 */
function safeEqual(
    left: string,
    right: string,
): boolean {
    const leftBuffer =
        Buffer.from(left);

    const rightBuffer =
        Buffer.from(right);

    if (
        leftBuffer.length !==
        rightBuffer.length
    ) {
        return false;
    }

    return timingSafeEqual(
        leftBuffer,
        rightBuffer,
    );
}

/**
 * Bearer Token 验证。
 */
function checkAuthorization(
    req: IncomingMessage,
    authToken?: string,
): boolean {
    /*
     * 没配置 Token：
     * 允许访问。
     *
     * 只建议本地测试使用。
     */
    if (!authToken) {
        return true;
    }

    const authorization =
        req.headers.authorization;

    if (!authorization) {
        return false;
    }

    const prefix = 'Bearer ';

    if (
        !authorization.startsWith(
            prefix,
        )
    ) {
        return false;
    }

    const token =
        authorization
            .slice(prefix.length)
            .trim();

    return safeEqual(
        token,
        authToken,
    );
}

/**
 * 返回 JSON。
 */
function jsonResponse(
    res: ServerResponse,
    statusCode: number,
    data: unknown,
): void {
    const body =
        JSON.stringify(data);

    res.statusCode =
        statusCode;

    res.setHeader(
        'Content-Type',
        'application/json; charset=utf-8',
    );

    res.setHeader(
        'Content-Length',
        Buffer.byteLength(body),
    );

    res.end(body);
}

/**
 * 启动 Remote MCP HTTP Server。
 */
export function startHttpServer(
    options: HttpServerOptions = {},
) {
    const host =
        options.host ??
        '127.0.0.1';

    const port =
        options.port ??
        8787;

    /*
     * MCP SDK v2 推荐的 HTTP Handler。
     *
     * buildServer 每次都会创建新的
     * McpServer。
     *
     * 默认同时兼容：
     * - legacy 2025-era
     * - modern 2026-07-28
     */
    const mcpHandler =
        createMcpHandler(
            buildServer,
        );

    /*
     * 将 Web Standard Request/Response
     * MCP Handler 转换成 Node HTTP Handler。
     */
    const nodeHandler =
        toNodeHandler(
            mcpHandler,
        );

    const server =
        createServer(
            (
                req,
                res,
            ) => {
                let url: URL;

                try {
                    url = new URL(
                        req.url ?? '/',
                        `http://${req.headers.host ?? 'localhost'}`,
                    );
                } catch {
                    jsonResponse(
                        res,
                        400,
                        {
                            error:
                                'Invalid URL',
                        },
                    );

                    return;
                }

                /*
                 * 健康检查不需要 Token。
                 *
                 * 只返回程序运行状态，
                 * 不返回任何项目信息。
                 */
                if (
                    req.method === 'GET' &&
                    url.pathname === '/healthz'
                ) {
                    jsonResponse(
                        res,
                        200,
                        {
                            status: 'ok',
                            service:
                                'shworks-devkit',
                            transport:
                                'streamable-http',
                        },
                    );

                    return;
                }

                /*
                 * 只开放 /mcp。
                 */
                if (
                    url.pathname !== '/mcp'
                ) {
                    jsonResponse(
                        res,
                        404,
                        {
                            error:
                                'Not Found',
                        },
                    );

                    return;
                }

                /*
                 * MCP endpoint 必须验证。
                 */
                if (
                    !checkAuthorization(
                        req,
                        options.authToken,
                    )
                ) {
                    httpLogger.warn(
                        {
                            ip:
                                req.socket.remoteAddress,
                            method:
                                req.method,
                            path:
                                url.pathname,
                            userAgent:
                                req.headers['user-agent'],
                        },
                        'Security audit: unauthorized MCP request rejected',
                    );

                    res.setHeader(
                        'WWW-Authenticate',
                        'Bearer realm="shworks-devkit"',
                    );

                    jsonResponse(
                        res,
                        401,
                        {
                            error:
                                'Unauthorized',
                        },
                    );

                    return;
                }

                /*
                 * 真正交给 MCP Handler。
                 */
                void nodeHandler(
                    req,
                    res,
                );
            },
        );

    server.listen(
        port,
        host,
        () => {
            httpLogger.info(
                {
                    host,
                    port,
                    endpoint:
                        `http://${host}:${port}/mcp`,
                    authEnabled:
                        Boolean(
                            options.authToken,
                        ),
                },
                'shworks-devkit Remote MCP started',
            );
        },
    );

    /**
     * 优雅退出。
     */
    async function shutdown(
        signal: string,
    ) {
        httpLogger.info(
            {
                signal,
            },
            'Remote MCP shutting down',
        );

        server.close();

        try {
            await mcpHandler.close();
        } catch (
            error
            ) {
            httpLogger.error(
                {
                    error,
                },
                'Failed to close MCP handler',
            );
        }
    }

    process.once(
        'SIGTERM',
        () => {
            void shutdown(
                'SIGTERM',
            );
        },
    );

    process.once(
        'SIGINT',
        () => {
            void shutdown(
                'SIGINT',
            );
        },
    );

    return server;
}
