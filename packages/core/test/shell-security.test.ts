import assert from 'node:assert/strict';
import {
    chmod,
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import {
    tmpdir,
} from 'node:os';
import {
    join,
} from 'node:path';
import test from 'node:test';

import type {
    ResolvedProject,
} from '../src/project/resolver.js';

import {
    buildSafeProcessEnv,
} from '../src/shell/process.js';
import {
    runTask,
} from '../src/shell/runner.js';

function makeProject(
    root: string,
    overrides: Partial<ResolvedProject> = {},
): ResolvedProject {
    return {
        record: {
            name: 'test-project',
            root,
            addedAt: new Date(0).toISOString(),
            trusted: true,
        },
        root,
        globalConfig: {
            workspaceRoots: [],
            autoDiscover: false,
            permissions: {
                read: true,
                write: true,
                delete: false,
                shell: 'restricted',
            },
            protected: [],
            allowedPrograms: [],
            allowedProjectExecutables: [],
        },
        config: {
            permissions: {},
            ignore: [],
            protected: [],
            commands: {},
        },
        permissions: {
            read: true,
            write: true,
            delete: false,
            shell: 'restricted',
        },
        protectedPatterns: [],
        ignorePatterns: [],
        ...overrides,
    };
}

test('host credentials are not inherited while normal custom env is kept', () => {
    const env = buildSafeProcessEnv(
        {
            PATH: '/usr/bin:/bin',
            HOME: '/tmp/home',
            AWS_SECRET_ACCESS_KEY: 'host-secret',
            SSH_AUTH_SOCK: '/tmp/agent.sock',
            NODE_OPTIONS: '--require=host-payload.js',
        },
        {
            NODE_ENV: 'production',
            PORT: '3000',
            CGO_ENABLED: '0',
            API_TOKEN: 'custom-secret',
        },
    );

    assert.equal(env.PATH, '/usr/bin:/bin');
    assert.equal(env.NODE_ENV, 'production');
    assert.equal(env.PORT, '3000');
    assert.equal(env.CGO_ENABLED, '0');
    assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(env.SSH_AUTH_SOCK, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.API_TOKEN, undefined);
});

test('untrusted projects cannot run tasks', async () => {
    const root = await mkdtemp(
        join(tmpdir(), 'shdev-untrusted-'),
    );

    try {
        const project = makeProject(root);
        project.record.trusted = false;
        project.config.commands.test = {
            program: 'git',
            args: ['--version'],
            cwd: '.',
            env: {},
            timeoutMs: 5_000,
        };
        project.globalConfig.allowedPrograms = ['git'];

        await assert.rejects(
            runTask(project, 'test'),
            /未被标记为可信/,
        );
    } finally {
        await rm(root, {
            recursive: true,
            force: true,
        });
    }
});

test('project-local executable cannot impersonate an allowed bare program', async () => {
    const root = await mkdtemp(
        join(tmpdir(), 'shdev-local-exec-'),
    );

    try {
        const fakeNode = join(root, 'node');
        await writeFile(
            fakeNode,
            '#!/bin/sh\necho should-not-run\n',
            'utf8',
        );
        await chmod(fakeNode, 0o755);

        const project = makeProject(root);
        project.globalConfig.allowedPrograms = ['node'];
        project.config.commands.test = {
            program: './node',
            args: [],
            cwd: '.',
            env: {},
            timeoutMs: 5_000,
        };

        await assert.rejects(
            runTask(project, 'test'),
            /未显式授权的项目脚本/,
        );
    } finally {
        await rm(root, {
            recursive: true,
            force: true,
        });
    }
});

test('restricted task strips runtime injection env but keeps normal build env', async (t) => {
    if (process.platform === 'win32') {
        t.skip('Homebrew target is Unix-like');
        return;
    }

    const root = await mkdtemp(
        join(tmpdir(), 'shdev-env-'),
    );

    try {
        const project = makeProject(root);
        project.globalConfig.allowedPrograms = ['env'];
        project.config.commands.test = {
            program: 'env',
            args: [],
            cwd: '.',
            env: {
                NODE_ENV: 'production',
                PORT: '3000',
                CGO_ENABLED: '0',
                PATH: '/tmp/evil-bin',
                NODE_PATH: '/tmp/evil-modules',
                NODE_OPTIONS: '--require=./payload.js',
                LD_PRELOAD: './payload.so',
                DYLD_INSERT_LIBRARIES: './payload.dylib',
                GIT_SSH_COMMAND: './payload',
                API_TOKEN: 'custom-secret',
            },
            timeoutMs: 5_000,
        };

        const result = await runTask(
            project,
            'test',
        );

        assert.equal(result.code, 0);
        assert.match(result.stdout, /NODE_ENV=production/);
        assert.match(result.stdout, /PORT=3000/);
        assert.match(result.stdout, /CGO_ENABLED=0/);
        assert.doesNotMatch(result.stdout, /PATH=\/tmp\/evil-bin/);
        assert.doesNotMatch(result.stdout, /NODE_PATH=\/tmp\/evil-modules/);
        assert.doesNotMatch(result.stdout, /NODE_OPTIONS=/);
        assert.doesNotMatch(result.stdout, /LD_PRELOAD=/);
        assert.doesNotMatch(result.stdout, /DYLD_INSERT_LIBRARIES=/);
        assert.doesNotMatch(result.stdout, /GIT_SSH_COMMAND=/);
        assert.doesNotMatch(result.stdout, /API_TOKEN=/);
    } finally {
        await rm(root, {
            recursive: true,
            force: true,
        });
    }
});
