import {
    loadGlobalConfig,
    loadProjectConfig,
} from '../config/loader.js';

import type {
    GlobalConfig,
    Permissions,
    ProjectConfig,
} from '../config/schema.js';

import {
    mergePermissions,
} from '../security/permissions.js';

import {
    getProject,
    type ProjectRecord,
} from './registry.js';

export interface ResolvedProject {
    record: ProjectRecord;

    root: string;

    globalConfig: GlobalConfig;

    config: ProjectConfig;

    permissions: Permissions;

    protectedPatterns: string[];

    ignorePatterns: string[];
}

export async function resolveProject(
    name: string,
): Promise<ResolvedProject> {
    const record =
        await getProject(name);

    const globalConfig =
        await loadGlobalConfig();

    const projectConfig =
        await loadProjectConfig(
            record.root,
        );

    const protectedPatterns = [
        ...globalConfig.protected,
        ...projectConfig.protected,
    ];

    return {
        record,

        root: record.root,

        globalConfig,

        config: projectConfig,

        permissions:
            mergePermissions(
                globalConfig,
                projectConfig,
            ),

        protectedPatterns: [
            ...new Set(
                protectedPatterns,
            ),
        ],

        ignorePatterns: [
            ...new Set(
                projectConfig.ignore,
            ),
        ],
    };
}
