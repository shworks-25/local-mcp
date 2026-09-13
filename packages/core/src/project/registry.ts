import {
    readdir,
    readFile,
    realpath,
    stat,
    writeFile,
} from 'node:fs/promises';

import {
    basename,
    resolve,
} from 'node:path';

import {
    parse,
    stringify,
} from 'yaml';

import * as z from 'zod/v4';

import {
    ensureConfigDir,
    expandHomePath,
    loadGlobalConfig,
    PROJECT_REGISTRY_PATH,
} from '../config/loader.js';

import {
    looksLikeProject,
} from './detector.js';

export const ProjectRecordSchema =
    z.object({
        name: z.string().min(1),
        root: z.string().min(1),
        addedAt: z.string(),
    });

export type ProjectRecord =
    z.infer<
        typeof ProjectRecordSchema
    >;

const RegistrySchema = z.object({
    version: z.literal(1).default(1),

    projects: z
        .array(ProjectRecordSchema)
        .default([]),
});

type Registry = z.infer<
    typeof RegistrySchema
>;

async function loadRegistry(): Promise<Registry> {
    try {
        const content =
            await readFile(
                PROJECT_REGISTRY_PATH,
                'utf8',
            );

        return RegistrySchema.parse(
            parse(content),
        );
    } catch (error) {
        const nodeError =
            error as NodeJS.ErrnoException;

        if (
            nodeError.code === 'ENOENT'
        ) {
            return RegistrySchema.parse({});
        }

        throw error;
    }
}

async function saveRegistry(
    registry: Registry,
): Promise<void> {
    await ensureConfigDir();

    await writeFile(
        PROJECT_REGISTRY_PATH,
        stringify(registry),
        'utf8',
    );
}

export async function listProjects(): Promise<ProjectRecord[]> {
    const registry =
        await loadRegistry();

    return registry.projects;
}

export async function getProject(
    name: string,
): Promise<ProjectRecord> {
    const projects =
        await listProjects();

    const project =
        projects.find(
            (item) =>
                item.name === name,
        );

    if (!project) {
        throw new Error(
            `未找到项目：${name}`,
        );
    }

    return project;
}

export async function addProject(
    projectRoot: string,
    requestedName?: string,
): Promise<ProjectRecord> {
    const absolute =
        resolve(
            expandHomePath(projectRoot),
        );

    const info = await stat(absolute);

    if (!info.isDirectory()) {
        throw new Error(
            `${absolute} 不是目录`,
        );
    }

    const root =
        await realpath(absolute);

    const registry =
        await loadRegistry();

    /*
     * 同一个目录已经注册过，直接返回。
     */
    const existingByRoot =
        registry.projects.find(
            (item) =>
                item.root === root,
        );

    if (existingByRoot) {
        return existingByRoot;
    }

    const baseName =
        requestedName?.trim() ||
        basename(root);

    let name = baseName;
    let suffix = 2;

    while (
        registry.projects.some(
            (item) =>
                item.name === name,
        )
        ) {
        name = `${baseName}-${suffix}`;
        suffix++;
    }

    const project: ProjectRecord = {
        name,
        root,
        addedAt:
            new Date().toISOString(),
    };

    registry.projects.push(project);

    registry.projects.sort(
        (a, b) =>
            a.name.localeCompare(
                b.name,
            ),
    );

    await saveRegistry(registry);

    return project;
}

/**
 * 根据全局 workspaceRoots 自动发现一级子目录中的项目。
 */
export async function syncAutoDiscoveredProjects(): Promise<void> {
    const config =
        await loadGlobalConfig();

    if (!config.autoDiscover) {
        return;
    }

    for (
        const configuredRoot
        of config.workspaceRoots
        ) {
        const root = resolve(
            expandHomePath(
                configuredRoot,
            ),
        );

        let entries;

        try {
            entries = await readdir(
                root,
                {
                    withFileTypes: true,
                },
            );
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            const candidate =
                resolve(
                    root,
                    entry.name,
                );

            if (
                await looksLikeProject(
                    candidate,
                )
            ) {
                await addProject(
                    candidate,
                );
            }
        }
    }
}
