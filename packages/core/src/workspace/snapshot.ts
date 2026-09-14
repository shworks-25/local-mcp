import {
    constants,
} from 'node:fs';
import {
    mkdir,
    open,
    readFile,
    rm,
    stat,
} from 'node:fs/promises';
import {
    dirname,
    relative,
} from 'node:path';
import {
    randomUUID,
} from 'node:crypto';

import type {
    ResolvedProject,
} from '../project/resolver.js';
import type {
    DeveloperRuntime,
} from '../runtime/developer-runtime.js';
import {
    runGit,
} from '../git/runner.js';
import {
    assertNotProtected,
    assertPermission,
    matchesAnyPattern,
} from '../security/permissions.js';
import {
    resolvePathWithinRoot,
} from '../security/path-guard.js';

interface SnapshotFile {
    path: string;
    content: Buffer;
    mode: number;
}

interface SnapshotRecord {
    id: string;
    project: string;
    createdAt: string;
    files: Map<string, SnapshotFile>;
}

const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const MAX_SNAPSHOT_FILES = 2_000;
const MAX_SNAPSHOTS = 3;

function getSnapshots(
    runtime: DeveloperRuntime,
): Map<string, SnapshotRecord> {
    return runtime.getStore(
        'workspace:snapshots',
        () => new Map<string, SnapshotRecord>(),
    );
}

async function listWorkspaceFiles(
    project: ResolvedProject,
): Promise<string[]> {
    const result = await runGit(
        project,
        [
            'ls-files',
            '-co',
            '--exclude-standard',
            '-z',
        ],
    );

    if (result.code !== 0) {
        throw new Error(
            'workspace snapshot 当前仅支持 Git 工作区',
        );
    }

    return result.stdout
        .split('\0')
        .filter(Boolean)
        .filter((path) =>
            !matchesAnyPattern(
                path,
                [
                    ...project.protectedPatterns,
                    ...project.ignorePatterns,
                ],
            ),
        );
}

export async function workspaceSnapshot(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
): Promise<{
    id: string;
    createdAt: string;
    fileCount: number;
    bytes: number;
}> {
    assertPermission(project.permissions, 'read');

    const paths = await listWorkspaceFiles(project);
    if (paths.length > MAX_SNAPSHOT_FILES) {
        throw new Error(
            `快照文件数超过限制：${paths.length} > ${MAX_SNAPSHOT_FILES}`,
        );
    }

    const files = new Map<string, SnapshotFile>();
    let totalBytes = 0;

    for (const path of paths) {
        assertNotProtected(path, project.protectedPatterns);
        const absolute = await resolvePathWithinRoot(
            project.root,
            path,
        );
        const info = await stat(absolute);
        if (!info.isFile()) {
            continue;
        }

        totalBytes += info.size;
        if (totalBytes > MAX_SNAPSHOT_BYTES) {
            throw new Error(
                `快照大小超过限制：${MAX_SNAPSHOT_BYTES} bytes`,
            );
        }

        files.set(path, {
            path,
            content: await readFile(absolute),
            mode: info.mode & 0o777,
        });
    }

    const snapshots = getSnapshots(runtime);
    while (snapshots.size >= MAX_SNAPSHOTS) {
        const oldestId = snapshots.keys().next().value as
            | string
            | undefined;
        if (!oldestId) {
            break;
        }
        snapshots.delete(oldestId);
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    snapshots.set(id, {
        id,
        project: project.record.name,
        createdAt,
        files,
    });

    return {
        id,
        createdAt,
        fileCount: files.size,
        bytes: totalBytes,
    };
}

export interface WorkspaceSnapshotInfo {
    id: string;
    project: string;
    createdAt: string;
    fileCount: number;
    bytes: number;
}

export function workspaceSnapshotList(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
): WorkspaceSnapshotInfo[] {
    assertPermission(project.permissions, 'read');

    return [...getSnapshots(runtime).values()]
        .filter(
            (record) =>
                record.project === project.record.name,
        )
        .map((record) => ({
            id: record.id,
            project: record.project,
            createdAt: record.createdAt,
            fileCount: record.files.size,
            bytes: [...record.files.values()]
                .reduce(
                    (sum, file) =>
                        sum + file.content.byteLength,
                    0,
                ),
        }));
}

function getProjectSnapshot(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
    snapshotId: string,
): SnapshotRecord {
    const snapshot = getSnapshots(runtime).get(snapshotId);

    if (!snapshot) {
        throw new Error(`未知或已失效的 snapshot：${snapshotId}`);
    }

    if (snapshot.project !== project.record.name) {
        throw new Error('snapshot 不属于当前项目');
    }

    return snapshot;
}

export async function workspaceRestorePreview(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
    snapshotId: string,
): Promise<{
    snapshotId: string;
    overwrite: string[];
    delete: string[];
    preserve: string[];
}> {
    assertPermission(project.permissions, 'read');

    const snapshot = getProjectSnapshot(
        runtime,
        project,
        snapshotId,
    );
    const currentFiles = await listWorkspaceFiles(project);
    const extras = currentFiles.filter(
        (path) => !snapshot.files.has(path),
    );

    return {
        snapshotId,
        overwrite: [...snapshot.files.keys()],
        delete: project.permissions.delete
            ? extras
            : [],
        preserve: project.permissions.delete
            ? []
            : extras,
    };
}

async function writeSnapshotFile(
    project: ResolvedProject,
    file: SnapshotFile,
): Promise<void> {
    const absolute = await resolvePathWithinRoot(
        project.root,
        file.path,
        { allowMissing: true },
    );

    await mkdir(dirname(absolute), {
        recursive: true,
    });

    const handle = await open(
        absolute,
        constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_TRUNC |
            constants.O_NOFOLLOW,
        file.mode,
    );

    try {
        await handle.writeFile(file.content);
        await handle.chmod(file.mode);
    } finally {
        await handle.close();
    }
}

export async function workspaceRestore(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
    snapshotId: string,
): Promise<{
    restored: number;
    removed: number;
    preservedNewFiles: string[];
    snapshotId: string;
}> {
    if (!project.record.trusted) {
        throw new Error(
            '未受信任项目为只读模式，禁止恢复快照',
        );
    }

    assertPermission(project.permissions, 'write');

    const snapshot = getProjectSnapshot(
        runtime,
        project,
        snapshotId,
    );
    const preview = await workspaceRestorePreview(
        runtime,
        project,
        snapshotId,
    );

    for (const file of snapshot.files.values()) {
        assertNotProtected(file.path, project.protectedPatterns);
        await resolvePathWithinRoot(
            project.root,
            file.path,
            { allowMissing: true },
        );
    }

    if (project.permissions.delete) {
        for (const path of preview.delete) {
            assertNotProtected(path, project.protectedPatterns);
            await resolvePathWithinRoot(
                project.root,
                path,
            );
        }
    }

    for (const file of snapshot.files.values()) {
        await writeSnapshotFile(project, file);
    }

    let removed = 0;

    for (const path of preview.delete) {
        const absolute = await resolvePathWithinRoot(
            project.root,
            path,
        );
        const rel = relative(project.root, absolute);
        if (rel.startsWith('..')) {
            throw new Error('拒绝删除项目目录之外的文件');
        }
        await rm(absolute, { force: true });
        removed += 1;
    }

    return {
        restored: snapshot.files.size,
        removed,
        preservedNewFiles: preview.preserve,
        snapshotId,
    };
}
