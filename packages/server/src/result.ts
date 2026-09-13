export function textResult(
    value: unknown,
) {
    const text =
        typeof value === 'string'
            ? value
            : JSON.stringify(
                value,
                null,
                2,
            );

    return {
        content: [
            {
                type:
                    'text' as const,
                text,
            },
        ],
    };
}

export async function safeResult(
    callback:
    () => Promise<unknown>,
) {
    try {
        return textResult(
            await callback(),
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        return {
            content: [
                {
                    type:
                        'text' as const,
                    text: message,
                },
            ],

            isError: true,
        };
    }
}
