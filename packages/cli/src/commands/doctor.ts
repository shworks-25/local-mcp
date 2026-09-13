import type {
    Command,
} from 'commander';

import {
    ensureConfigDir,
    listProjects,
    runProcess,
} from '@shworks/local-core';

async function checkProgram(
    program: string,
    args: string[],
): Promise<boolean> {
    try {
        const result =
            await runProcess(
                program,
                args,
                {
                    timeoutMs:
                        5_000,
                },
            );

        return (
            result.code === 0
        );
    } catch {
        return false;
    }
}

export function registerDoctorCommand(
    program: Command,
): void {
    program
        .command('doctor')
        .description(
            '检查本机开发环境',
        )
        .action(
            async () => {
                await ensureConfigDir();

                const git =
                    await checkProgram(
                        'git',
                        ['--version'],
                    );

                const rg =
                    await checkProgram(
                        'rg',
                        ['--version'],
                    );

                const projects =
                    await listProjects();

                console.log(
                    `Node: ${process.version}`,
                );

                console.log(
                    `Git: ${git ? 'OK' : 'MISSING'}`,
                );

                console.log(
                    `ripgrep: ${rg ? 'OK' : 'MISSING'}`,
                );

                console.log(
                    `Projects: ${projects.length}`,
                );
            },
        );
}
