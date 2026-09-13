import assert from 'node:assert/strict';
import {
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
    packageRunScript,
    packageScripts,
} from '../src/package/scripts.js';

function makeProject(
    root: string,
    trusted = true,
): ResolvedProject {
    return {
        record: {
            name: 'capability-test',
            root,
            addedAt: new Date(0).toISOString(),
            trusted,
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
            allowedPrograms: [
                'npm',
                'pnpm',
                'yarn',
            ],
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
    };
}

test('package_scripts detects scripts and pnpm lockfile', async () => {
    const root = await mkdtemp(
        join(tmpdir(), 'shdev-package-'),
    );

    try {
        await writeFile(
            join(root, 'package.json'),
            JSON.stringify({
                scripts: {
                    test: 'node test.js',
                    lint: 'eslint .',
                },
            }),
            'utf8',
        );
        await writeFile(
            join(root, 'pnpm-lock.yaml'),
            'lockfileVersion: 9\n',
            'utf8',
        );

        const result = await packageScripts(
            makeProject(root),
        );

        assert.equal(result.manager, 'pnpm');
        assert.equal(result.scripts.test, 'node test.js');
        assert.equal(result.scripts.lint, 'eslint .');
    } finally {
        await rm(root, {
            recursive: true,
            force: true,
        });
    }
});

test('package_run_script refuses untrusted projects before execution', async () => {
    const root = await mkdtemp(
        join(tmpdir(), 'shdev-package-untrusted-'),
    );

    try {
        await writeFile(
            join(root, 'package.json'),
            JSON.stringify({
                scripts: {
                    test: 'echo should-not-run',
                },
            }),
            'utf8',
        );

        await assert.rejects(
            packageRunScript(
                makeProject(root, false),
                'test',
            ),
            /未被标记为可信/,
        );
    } finally {
        await rm(root, {
            recursive: true,
            force: true,
        });
    }
});
