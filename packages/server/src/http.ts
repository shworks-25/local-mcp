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

const MAX_REQUEST_BODY_BYTES =
    4 * 1024 * 1024;

const RATE_LIMIT_WINDOW_MS =
    60_000;

const RATE_LIMIT_MAX_REQUESTS =
    120;

export interface HttpServerOptions {
    host?: string;
    port?: number;

    /**
     * Bearer Token。
     *
     * 仅 loopback 地址允许不配置 Token；任何非本机监听地址都必须认证。
     */
    authToken?: string;
}

function isLoopbackHost(host: string): boolean {
    const normalized = host
        .trim()
        .toLowerCase()
        .replace(/^\[/, '')
        .replace(/\]$/, '');

    return (
        normalized === 'localhost' ||
        normalized === '::1' ||
        /^127(?:\.\d{1,3}){3}$/.test(normalized)
    );
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

    if (
        !isLoopbackHost(host) &&
        !options.authToken
    ) {
        throw new Error(
            `拒绝在非 loopback 地址 ${host} 上启动未认证的 Remote MCP；请配置 authToken`,
        );
    }

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

    const rateLimitState =
        new Map<
            string,
            {
                count: number;
                resetAt: number;
            }
        >();

    /**
     * 定期清理过期的限流状态记录，防止 IP 键在长时间运行下产生内存泄漏。
     */
    const pruneExpiredRateLimits = (
        now: number,
    ): void => {
        if (rateLimitState.size < 1000) {
            return;
        }

        for (const [key, entry] of rateLimitState) {
            if (entry.resetAt <= now) {
                rateLimitState.delete(key);
            }
        }
    };

    const isRateLimited = (
        req: IncomingMessage,
    ): boolean => {
        const key =
            req.socket.remoteAddress ??
            'unknown';
        const now = Date.now();

        pruneExpiredRateLimits(now);

        const existing =
            rateLimitState.get(key);

        if (
            !existing ||
            existing.resetAt <= now
        ) {
            rateLimitState.set(
                key,
                {
                    count: 1,
                    resetAt:
                        now +
                        RATE_LIMIT_WINDOW_MS,
                },
            );
            return false;
        }

        existing.count += 1;
        return (
            existing.count >
            RATE_LIMIT_MAX_REQUESTS
        );
    };

    const server =
        createServer(
            (
                req,
                res,
            ) => {
                const contentLength = Number(
                    req.headers['content-length'] ?? 0,
                );

                if (contentLength > MAX_REQUEST_BODY_BYTES) {
                    jsonResponse(
                        res,
                        413,
                        {
                            error:
                                'Payload Too Large: 请求体大小超出 4MB 上限',
                        },
                    );
                    return;
                }

                let receivedBytes = 0;
                req.on('data', (chunk: Buffer) => {
                    receivedBytes += chunk.length;
                    if (receivedBytes > MAX_REQUEST_BODY_BYTES) {
                        req.destroy();
                        if (!res.headersSent) {
                            jsonResponse(
                                res,
                                413,
                                {
                                    error:
                                        'Payload Too Large: 传输数据超出 4MB 上限',
                                },
                            );
                        }
                    }
                });

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

                if (isRateLimited(req)) {
                    res.setHeader(
                        'Retry-After',
                        '60',
                    );

                    jsonResponse(
                        res,
                        429,
                        {
                            error:
                                'Too Many Requests',
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

    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    server.maxHeadersCount = 100;

    server.on('clientError', (_err, socket) => {
        if (socket.writable) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        } else {
            socket.destroy();
        }
    });

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

            if (!options.authToken) {
                httpLogger.warn(
                    'Remote MCP running without authentication; ensure service is not exposed to untrusted networks',
                );
            }

            if (!isLoopbackHost(host)) {
                httpLogger.warn(
                    'Remote MCP bound to non-loopback interface; ensure traffic is encrypted behind an HTTPS reverse proxy to prevent token sniffing',
                );
            }
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
