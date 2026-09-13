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

startHttpServer({
    host,
    port,
    authToken,
});
