import {
    access,
    readFile,
    readdir,
} from 'node:fs/promises';

import {
    resolvePathWithinRoot,
} from '../security/path-guard.js';

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

async function existsWithinRoot(
    root: string,
    file: string,
): Promise<boolean> {
    try {
        const relativePath = relative(root, file);
        const resolved = await resolvePathWithinRoot(
            root,
            relativePath,
        );
        await access(resolved);
        return true;
    } catch {
        return false;
    }
}

async function readTextSafe(
    root: string,
    file: string,
): Promise<string> {
    try {
        const relativePath = relative(root, file);
        const resolved = await resolvePathWithinRoot(
            root,
            relativePath,
        );
        return await readFile(
            resolved,
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
            await existsWithinRoot(
                root,
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

        if (await existsWithinRoot(root, packageJson)) {
            addTechnology(
                'Node.js',
                location,
            );

            try {
                const parsed =
                    JSON.parse(
                        await readTextSafe(
                            root,
                            packageJson,
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

        if (await existsWithinRoot(root, goMod)) {
            addTechnology(
                'Go',
                location,
            );

            const content =
                await readTextSafe(
                    root,
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

        if (await existsWithinRoot(root, composer)) {
            addTechnology(
                'PHP',
                location,
            );

            const content =
                await readTextSafe(
                    root,
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
            await existsWithinRoot(
                root,
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
            await existsWithinRoot(
                root,
                join(
                    location,
                    'build.gradle.kts',
                ),
            ) ||
            await existsWithinRoot(
                root,
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
            await existsWithinRoot(
                root,
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
