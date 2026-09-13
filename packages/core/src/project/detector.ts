import {
    access,
    readFile,
    readdir,
} from 'node:fs/promises';

import {
    join,
    relative,
} from 'node:path';

export interface DetectedItem {
    name: string;
    path: string;
}

export interface ProjectDetection {
    technologies: DetectedItem[];
    frameworks: DetectedItem[];
}

async function exists(
    file: string,
): Promise<boolean> {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

async function readTextSafe(
    file: string,
): Promise<string> {
    try {
        return await readFile(
            file,
            'utf8',
        );
    } catch {
        return '';
    }
}

function displayPath(
    root: string,
    location: string,
): string {
    return (
        relative(
            root,
            location,
        ) || '.'
    ).replaceAll('\\', '/');
}

export async function looksLikeProject(
    root: string,
): Promise<boolean> {
    const markers = [
        '.git',
        'package.json',
        'go.mod',
        'composer.json',
        'Package.swift',
        'pubspec.yaml',
        'build.gradle',
        'build.gradle.kts',
        'settings.gradle.kts',
    ];

    for (const marker of markers) {
        if (
            await exists(
                join(
                    root,
                    marker,
                ),
            )
        ) {
            return true;
        }
    }

    return false;
}

async function projectLocations(
    root: string,
): Promise<string[]> {
    const result = [root];

    let entries;

    try {
        entries = await readdir(
            root,
            {
                withFileTypes: true,
            },
        );
    } catch {
        return result;
    }

    const ignored = new Set([
        '.git',
        'node_modules',
        'vendor',
        'Pods',
        'DerivedData',
        'dist',
        'build',
    ]);

    for (const entry of entries) {
        if (
            !entry.isDirectory() ||
            ignored.has(entry.name)
        ) {
            continue;
        }

        result.push(
            join(
                root,
                entry.name,
            ),
        );
    }

    return result;
}

export async function detectProject(
    root: string,
): Promise<ProjectDetection> {
    const technologies =
        new Map<string, DetectedItem>();

    const frameworks =
        new Map<string, DetectedItem>();

    function addTechnology(
        name: string,
        location: string,
    ) {
        const path =
            displayPath(
                root,
                location,
            );

        technologies.set(
            `${name}:${path}`,
            {
                name,
                path,
            },
        );
    }

    function addFramework(
        name: string,
        location: string,
    ) {
        const path =
            displayPath(
                root,
                location,
            );

        frameworks.set(
            `${name}:${path}`,
            {
                name,
                path,
            },
        );
    }

    const locations =
        await projectLocations(root);

    for (const location of locations) {
        const packageJson =
            join(
                location,
                'package.json',
            );

        if (await exists(packageJson)) {
            addTechnology(
                'Node.js',
                location,
            );

            try {
                const parsed =
                    JSON.parse(
                        await readFile(
                            packageJson,
                            'utf8',
                        ),
                    ) as {
                        dependencies?: Record<
                            string,
                            string
                        >;
                        devDependencies?: Record<
                            string,
                            string
                        >;
                    };

                const dependencies = {
                    ...parsed.dependencies,
                    ...parsed.devDependencies,
                };

                if (dependencies.vue) {
                    addFramework(
                        'Vue',
                        location,
                    );
                }

                if (dependencies.react) {
                    addFramework(
                        'React',
                        location,
                    );
                }

                if (
                    dependencies.next
                ) {
                    addFramework(
                        'Next.js',
                        location,
                    );
                }
            } catch {
                // package.json 无法解析时，不阻塞整个项目识别。
            }
        }

        const goMod =
            join(
                location,
                'go.mod',
            );

        if (await exists(goMod)) {
            addTechnology(
                'Go',
                location,
            );

            const content =
                await readTextSafe(
                    goMod,
                );

            if (
                content.includes(
                    'cloudwego/hertz',
                )
            ) {
                addFramework(
                    'Hertz',
                    location,
                );
            }

            if (
                content.includes(
                    'gorm.io/gorm',
                )
            ) {
                addFramework(
                    'GORM',
                    location,
                );
            }
        }

        const composer =
            join(
                location,
                'composer.json',
            );

        if (await exists(composer)) {
            addTechnology(
                'PHP',
                location,
            );

            const content =
                await readTextSafe(
                    composer,
                );

            if (
                content.includes(
                    '"laravel/framework"',
                )
            ) {
                addFramework(
                    'Laravel',
                    location,
                );
            }
        }

        if (
            await exists(
                join(
                    location,
                    'Package.swift',
                ),
            )
        ) {
            addTechnology(
                'Swift',
                location,
            );

            addFramework(
                'Swift Package Manager',
                location,
            );
        }

        if (
            await exists(
                join(
                    location,
                    'build.gradle.kts',
                ),
            ) ||
            await exists(
                join(
                    location,
                    'settings.gradle.kts',
                ),
            )
        ) {
            addTechnology(
                'Kotlin',
                location,
            );

            addFramework(
                'Gradle',
                location,
            );
        }

        if (
            await exists(
                join(
                    location,
                    'pubspec.yaml',
                ),
            )
        ) {
            addTechnology(
                'Dart',
                location,
            );

            addFramework(
                'Flutter',
                location,
            );
        }
    }

    return {
        technologies:
            [...technologies.values()],

        frameworks:
            [...frameworks.values()],
    };
}
