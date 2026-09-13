import type {
    Command,
} from 'commander';

import {
    addProject,
} from '@shworks/local-core';

export function registerProjectAddCommand(
    projectCommand: Command,
): void {
    projectCommand
        .command('add')
        .description(
            '注册一个本地项目',
        )
        .argument(
            '<path>',
            '项目路径',
        )
        .option(
            '-n, --name <name>',
            '自定义项目名',
        )
        .action(
            async (
                path: string,
                options: {
                    name?: string;
                },
            ) => {
                const project =
                    await addProject(
                        path,
                        options.name,
                    );

                console.log(
                    `已注册项目：${project.name}`,
                );

                console.log(
                    `路径：${project.root}`,
                );
            },
        );
}
