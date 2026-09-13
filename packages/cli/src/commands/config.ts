import type {
    Command,
} from 'commander';

import {
    CONFIG_DIR,
    GLOBAL_CONFIG_PATH,
    PROJECT_REGISTRY_PATH,
    loadGlobalConfig,
} from '@shworks/local-core';

export function registerConfigCommand(
    program: Command,
): void {
    program
        .command('config')
        .description(
            '查看 shworks-devkit 配置',
        )
        .action(
            async () => {
                const config =
                    await loadGlobalConfig();

                console.log(
                    JSON.stringify(
                        {
                            configDir:
                            CONFIG_DIR,

                            globalConfig:
                            GLOBAL_CONFIG_PATH,

                            projectRegistry:
                            PROJECT_REGISTRY_PATH,

                            config,
                        },
                        null,
                        2,
                    ),
                );
            },
        );
}
