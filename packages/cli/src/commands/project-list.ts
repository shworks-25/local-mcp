import type {
    Command,
} from 'commander';

import {
    listProjects,
    syncAutoDiscoveredProjects,
} from '@shworks/local-core';

export function registerProjectListCommand(
    projectCommand: Command,
): void {
    projectCommand
        .command('list')
        .description(
            '查看已注册项目',
        )
        .action(
            async () => {
                await syncAutoDiscoveredProjects();

                const projects =
                    await listProjects();

                if (
                    projects.length === 0
                ) {
                    console.log(
                        '暂未注册项目',
                    );

                    return;
                }

                for (
                    const project
                    of projects
                    ) {
                    console.log(
                        `${project.name}\t${project.root}`,
                    );
                }
            },
        );
}
