#!/usr/bin/env node

import {
    readFileSync,
} from 'node:fs';

import {
    Command,
} from 'commander';

import {
    registerStartCommand,
} from './commands/start.js';

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
    .name('shdev')
    .description(
        'Shworks local development toolkit',
    )
    .version(packageVersion);

registerStartCommand(
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

await program.parseAsync(
    process.argv,
);
