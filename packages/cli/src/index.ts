#!/usr/bin/env node

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
    registerDoctorCommand,
} from './commands/doctor.js';

import {
    registerConfigCommand,
} from './commands/config.js';

const program =
    new Command();

program
    .name('shdev')
    .description(
        'Shworks local development toolkit',
    )
    .version('0.1.0');

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

registerDoctorCommand(
    program,
);

registerConfigCommand(
    program,
);

await program.parseAsync(
    process.argv,
);
