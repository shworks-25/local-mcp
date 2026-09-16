#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    startHttpServer,
} from './http.js';

// 自动检测并加载当前目录下的 .env，避免独立运行 shmcp-http 时缺少环境变量
const defaultEnvPath = resolve(process.cwd(), '.env');
if (existsSync(defaultEnvPath) && typeof process.loadEnvFile === 'function') {
    try {
        process.loadEnvFile(defaultEnvPath);
    } catch {
        // ignore syntax/read error
    }
}

const host =
    process.env.MCP_HOST ??
    '127.0.0.1';

const port =
    Number(
        process.env.MCP_PORT ??
        '8787',
    );

const authToken =
    process.env.MCP_AUTH_TOKEN;

const allowInsecureHttp =
    process.env.MCP_ALLOW_INSECURE_HTTP === '1';

if (
    process.env.NODE_ENV ===
    'production' &&
    !authToken
) {
    console.error(
        'MCP_AUTH_TOKEN is required in production',
    );

    process.exit(1);
}

const maxBodyBytesEnv =
    process.env.MCP_MAX_BODY_BYTES;

const maxBodyBytes =
    maxBodyBytesEnv &&
    !Number.isNaN(Number(maxBodyBytesEnv)) &&
    Number(maxBodyBytesEnv) > 0
        ? Number(maxBodyBytesEnv)
        : undefined;

const allowedHostsEnv =
    process.env.MCP_ALLOWED_HOSTS;

const allowedHosts =
    allowedHostsEnv
        ? allowedHostsEnv
              .split(',')
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
        : undefined;

startHttpServer({
    host,
    port,
    authToken,
    allowInsecureHttp,
    maxBodyBytes,
    allowedHosts,
});
