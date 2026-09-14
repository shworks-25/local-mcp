import {
    detectProject,
} from './detector.js';

import {
    resolveProject,
} from './resolver.js';

import {
    gitBranch,
} from '../git/branch.js';

import {
    gitStatus,
} from '../git/status.js';

import {
    readTextFile,
} from '../filesystem/read.js';

import {
    assertPermission,
} from '../security/permissions.js';

export async function getProjectContext(
    projectName: string,
) {
    const project =
        await resolveProject(
            projectName,
        );

    assertPermission(
        project.permissions,
        'read',
    );

    const detection =
        await detectProject(
            project.root,
        );

    let branch:
        | string
        | undefined;

    let status:
        | string
        | undefined;

    try {
        branch =
            await gitBranch(
                project,
            );

        status =
            await gitStatus(
                project,
            );
    } catch {
        // 非 Git 项目也可以继续使用。
    }

    let agentsMd:
        | string
        | undefined;

    let agentsMdPresent = false;

    try {
        const agents =
            await readTextFile(
                project,
                'AGENTS.md',
                100_000,
            );

        agentsMdPresent = true;

        if (project.record.trusted) {
            agentsMd =
                agents.content;
        }
    } catch {
        // AGENTS.md 是可选文件。
    }

    return {
        name:
        project.record.name,

        technologies:
        detection.technologies,

        frameworks:
        detection.frameworks,

        git: {
            branch,
            status,
        },

        permissions:
        project.permissions,

        availableTasks:
            Object.keys(
                project.config.commands,
            ),

        agentsMdPresent,
        agentsMd,
    };
}
