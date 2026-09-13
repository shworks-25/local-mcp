import assert from 'node:assert/strict';
import test from 'node:test';

import {
    startHttpServer,
} from '../src/http.js';

test('non-loopback HTTP binding requires an auth token', () => {
    assert.throws(
        () => {
            startHttpServer({
                host: '0.0.0.0',
                port: 0,
            });
        },
        /非 loopback 地址.*authToken/,
    );
});
