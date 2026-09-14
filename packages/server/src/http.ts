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
    DeveloperRuntime,
    getLogger,
} from '@shworks/local-core';

import {
    buildServer,
} from './server.js';

const httpLogger =
    getLogger('mcp:http');

const DEFAULT_MAX_REQUEST_BODY_BYTES =
    16 * 1024 * 1024;

const MAX_RATE_LIMIT_KEYS = 1_024;

const RATE_LIMIT_WINDOW_MS =
    60_000;

const RATE_LIMIT_MAX_REQUESTS =
    120;
const FAILED_AUTH_RATE_LIMIT_MAX_REQUESTS =
    30;


export interface HttpServerOptions {
    host?: string;
    port?: number;

    /**
     * Bearer Token。
     *
     * 仅 loopback 地址允许不配置 Token；任何非本机监听地址都必须认证。
     */
    authToken?: string;

    /**
     * 显式允许在非 loopback 地址上使用明文 HTTP。
     * 默认 false；公开网络部署应使用 HTTPS 反向代理。
     */
    allowInsecureHttp?: boolean;

    /**
     * 单次 HTTP 请求体最大字节数上限。
     * 默认 16MB (16 * 1024 * 1024)。
     */
    maxBodyBytes?: number;
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
        /^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(normalized)
    );
}

function extractHostname(
    value: string,
): string | undefined {
    try {
        return new URL(
            value.includes('://')
                ? value
                : `http://${value}`,
        ).hostname;
    } catch {
        return undefined;
    }
}

function validateLoopbackRequestHeaders(
    req: IncomingMessage,
    boundHost: string,
): boolean {
    if (!isLoopbackHost(boundHost)) {
        return true;
    }

    const hostHeader = req.headers.host;
    if (
        hostHeader &&
        !isLoopbackHost(
            extractHostname(hostHeader) ?? '',
        )
    ) {
        return false;
    }

    const origin = req.headers.origin;
    if (
        origin &&
        !isLoopbackHost(
            extractHostname(origin) ?? '',
        )
    ) {
        return false;
    }

    const referer = req.headers.referer;
    if (
        referer &&
        !isLoopbackHost(
            extractHostname(referer) ?? '',
        )
    ) {
        return false;
    }

    const fetchSite =
        req.headers['sec-fetch-site'];

    if (fetchSite === 'cross-site') {
        return false;
    }

    return true;
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
    onFinish?: () => void,
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

    if (statusCode === 413 || onFinish) {
        res.setHeader('Connection', 'close');
    }

    res.end(body, () => {
        onFinish?.();
    });
}

/**
 * 流式读取请求体并执行实时字节上限熔断。
 *
 * 目的在于防御未携带 Content-Length 或伪造长度的 chunked 分块 DoS 穿透攻击。
 * 当累积字节超过设定上限时立即终止读取并主动销毁底层连接。
 */
function readRequestBodyWithLimit(
    req: IncomingMessage,
    res: ServerResponse,
    maxBytes: number,
): Promise<
    | { ok: true; buffer: Buffer }
    | { ok: false; status: number; error: string }
> {
    return new Promise((resolve) => {
        if (req.destroyed) {
            resolve({
                ok: false,
                status: 400,
                error: 'Bad Request: 连接已中断',
            });
            return;
        }

        let totalBytes = 0;
        const chunks: Buffer[] = [];
        let completed = false;

        const onData = (chunk: unknown) => {
            if (completed) {
                return;
            }

            const buffer = Buffer.isBuffer(chunk)
                ? chunk
                : typeof chunk === 'string'
                  ? Buffer.from(chunk)
                  : Buffer.from(chunk as Uint8Array);

            totalBytes += buffer.length;

            if (totalBytes > maxBytes) {
                completed = true;
                cleanup();
                req.pause();
                const limitMb = (maxBytes / (1024 * 1024)).toFixed(0);
                resolve({
                    ok: false,
                    status: 413,
                    error: `Payload Too Large: 请求体大小超出 ${limitMb}MB 上限`,
                });
            } else {
                chunks.push(buffer);
            }
        };

        const onEnd = () => {
            if (completed) {
                return;
            }

            completed = true;
            cleanup();
            resolve({
                ok: true,
                buffer: Buffer.concat(chunks),
            });
        };

        const onError = () => {
            if (completed) {
                return;
            }

            completed = true;
            cleanup();
            resolve({
                ok: false,
                status: 400,
                error: 'Bad Request: 数据流读取失败',
            });
        };

        const onClose = () => {
            if (completed) {
                return;
            }

            completed = true;
            cleanup();
            resolve({
                ok: false,
                status: 499,
                error: 'Client Closed Request',
            });
        };

        const cleanup = () => {
            req.off('data', onData);
            req.off('end', onEnd);
            req.off('error', onError);
            res.off('close', onClose);
        };

        req.on('data', onData);
        req.on('end', onEnd);
        req.on('error', onError);
        res.once('close', onClose);
    });
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

    const maxBodyBytes =
        options.maxBodyBytes ??
        DEFAULT_MAX_REQUEST_BODY_BYTES;

    if (!isLoopbackHost(host)) {
        if (!options.authToken) {
            throw new Error(
                `拒绝在非 loopback 地址 ${host} 上启动未认证的 Remote MCP；请配置 authToken`,
            );
        }

        if (!options.allowInsecureHttp) {
            throw new Error(
                `拒绝在非 loopback 地址 ${host} 上使用明文 HTTP；请通过 HTTPS 反向代理访问，或显式设置 allowInsecureHttp=true`,
            );
        }
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
    const runtime =
        new DeveloperRuntime();

    const mcpHandler =
        createMcpHandler(
            () => buildServer(runtime),
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

    const failedAuthRateLimitState =
        new Map<
            string,
            {
                count: number;
                resetAt: number;
            }
        >();

    /**
     * 清理过期限流记录并执行硬容量上限。
     * Map 使用插入顺序，容量满时淘汰最旧记录，避免短时间大量来源导致内存无界增长。
     */
    const pruneRateLimitMap = (
        state: Map<
            string,
            {
                count: number;
                resetAt: number;
            }
        >,
        now: number,
    ): void => {
        for (const [key, entry] of state) {
            if (entry.resetAt <= now) {
                state.delete(key);
            }
        }

        while (state.size >= MAX_RATE_LIMIT_KEYS) {
            const oldestKey = state.keys().next().value as
                | string
                | undefined;

            if (!oldestKey) {
                break;
            }

            state.delete(oldestKey);
        }
    };

    const pruneExpiredRateLimits = (
        now: number,
    ): void => {
        pruneRateLimitMap(
            rateLimitState,
            now,
        );
        pruneRateLimitMap(
            failedAuthRateLimitState,
            now,
        );
    };

    const isRateLimited = (
        req: IncomingMessage,
    ): boolean => {
        const key =
            req.socket.remoteAddress ??
            'authenticated-principal';
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

    const isFailedAuthRateLimited = (
        req: IncomingMessage,
    ): boolean => {
        const key =
            req.socket.remoteAddress ??
            'unknown';
        const now = Date.now();

        pruneExpiredRateLimits(now);

        const existing =
            failedAuthRateLimitState.get(key);

        if (
            !existing ||
            existing.resetAt <= now
        ) {
            failedAuthRateLimitState.set(
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
            FAILED_AUTH_RATE_LIMIT_MAX_REQUESTS
        );
    };

    let cleanupPromise:
        | Promise<void>
        | undefined;

    const cleanupResources = (): Promise<void> => {
        cleanupPromise ??= (async () => {
            await mcpHandler.close();

            await runtime.reset();
        })();

        return cleanupPromise;
    };

    const server =
        createServer(
            async (
                req,
                res,
            ) => {
                const contentLength = Number(
                    req.headers['content-length'] ?? 0,
                );

                if (contentLength > maxBodyBytes) {
                    const limitMb = (maxBodyBytes / (1024 * 1024)).toFixed(0);
                    jsonResponse(
                        res,
                        413,
                        {
                            error:
                                `Payload Too Large: 请求体大小超出 ${limitMb}MB 上限`,
                        },
                    );
                    return;
                }

                if (
                    !validateLoopbackRequestHeaders(
                        req,
                        host,
                    )
                ) {
                    jsonResponse(
                        res,
                        403,
                        {
                            error:
                                'Forbidden Host or Origin',
                        },
                    );
                    return;
                }

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
                 * 已认证请求在鉴权后进入独立速率限制，避免匿名请求耗尽合法客户端额度。
                 */
                if (
                    !checkAuthorization(
                        req,
                        options.authToken,
                    )
                ) {
                    if (isFailedAuthRateLimited(req)) {
                        res.setHeader(
                            'Retry-After',
                            '60',
                        );

                        jsonResponse(
                            res,
                            429,
                            {
                                error:
                                    'Too Many Unauthorized Requests',
                            },
                        );
                        return;
                    }

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
                 * 对携带请求体的请求统一执行流式字节上限校验与熔断。
                 * 杜绝 chunked 传输伪造大小或慢速流 DoS 穿透。
                 */
                if (
                    req.method !== 'GET' &&
                    req.method !== 'HEAD'
                ) {
                    const bodyResult =
                        await readRequestBodyWithLimit(
                            req,
                            res,
                            maxBodyBytes,
                        );

                    if (!bodyResult.ok) {
                        if (!res.headersSent && !res.destroyed) {
                            jsonResponse(
                                res,
                                bodyResult.status,
                                {
                                    error: bodyResult.error,
                                },
                                () => {
                                    req.destroy();
                                },
                            );
                        }
                        return;
                    }

                    const bodyBuffer =
                        bodyResult.buffer;

                    req[Symbol.asyncIterator] =
                        async function* () {
                            yield bodyBuffer;
                        };
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

    server.once('close', () => {
        void cleanupResources().catch((error) => {
            httpLogger.error(
                { error },
                'Failed to clean up HTTP Developer Runtime resources',
            );
        });
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
            await cleanupResources();
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

    const onSigterm = () => {
        void shutdown('SIGTERM');
    };

    const onSigint = () => {
        void shutdown('SIGINT');
    };

    process.once(
        'SIGTERM',
        onSigterm,
    );

    process.once(
        'SIGINT',
        onSigint,
    );

    server.once('close', () => {
        process.removeListener(
            'SIGTERM',
            onSigterm,
        );
        process.removeListener(
            'SIGINT',
            onSigint,
        );
    });

    return server;
}
