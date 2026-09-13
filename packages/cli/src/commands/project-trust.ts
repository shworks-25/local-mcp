import type {
    Command,
} from 'commander';

import {
    setProjectTrust,
} from '@shworks/local-core';

/**
 * 注册项目信任管理命令（trust / untrust）。
 *
 * 核心目的：
 * 为本地 CLI 提供对注册项目信任凭据的显式授权与注销能力。
 * 遵循零信任防御原则，确保仅有用户明确信任的项目方可调用 shell 任务。
 */
export function registerProjectTrustCommands(
    projectCommand: Command,
): void {
    projectCommand
        .command('trust')
        .description(
            '将已注册项目标记为可信，允许执行项目任务',
        )
        .argument('<name>', '项目名')
        .action(async (name: string) => {
            const project =
                await setProjectTrust(
                    name,
                    true,
                );

            console.log(
                `已信任项目：${project.name}`,
            );
        });

    projectCommand
        .command('untrust')
        .description(
            '取消项目可信状态，禁止执行项目任务',
        )
        .argument('<name>', '项目名')
        .action(async (name: string) => {
            const project =
                await setProjectTrust(
                    name,
                    false,
                );

            console.log(
                `已取消信任项目：${project.name}`,
            );
        });
}
