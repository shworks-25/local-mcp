#!/usr/bin/env node

import {
    readFileSync,
} from 'node:fs';

import {
    Command,
} from 'commander';

import {
    registerMcpCommand,
} from './commands/mcp.js';

import {
    startStdioServer,
} from '@shworks/local-mcp';

import {
    registerProjectAddCommand,
} from './commands/project-add.js';

import {
    registerProjectListCommand,
} from './commands/project-list.js';

import {
    registerProjectTrustCommands,
} from './commands/project-trust.js';

import {
    registerDoctorCommand,
} from './commands/doctor.js';

import {
    registerConfigCommand,
} from './commands/config.js';

const packageVersion = (
    JSON.parse(
        readFileSync(
            new URL('../package.json', import.meta.url),
            'utf8',
        ),
    ) as { version: string }
).version;

const program =
    new Command();

program
    .name('shmcp')
    .description(
        'Shworks local developer runtime and MCP server',
    )
    .version(packageVersion);

registerMcpCommand(
    program,
);

const projectCommand =
    program
        .command('project')
        .description(
            '项目管理',
        );

registerProjectAddCommand(
    projectCommand,
);

registerProjectListCommand(
    projectCommand,
);

registerProjectTrustCommands(
    projectCommand,
);

registerDoctorCommand(
    program,
);

registerConfigCommand(
    program,
);

/*
 * 当用户直接执行 shmcp 不带任何子命令时，
 * 默认直接启动本地 MCP stdio 服务（供 Claude Desktop / Cursor 直连）。
 * 带有参数或子命令时，交由 Commander 进行严格参数解析与未知命令校验。
 */
if (process.argv.length <= 2) {
    try {
        await startStdioServer();
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        process.stderr.write(
            `[shmcp] 启动 MCP stdio 服务失败: ${message}\n`,
        );
        process.exit(1);
    }
} else {
    await program.parseAsync(
        process.argv,
    );
}
