#!/usr/bin/env node

import {
    startHttpServer,
} from './http.js';

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
