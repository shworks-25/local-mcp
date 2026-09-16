const SENSITIVE_KEYS = [
    'password',
    'passwd',
    'token',
    'secret',
    'privatekey',
    'authorization',
    'apikey',
    'api_key',
];

export function isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase().replace(/[-_]/g, '');
    return SENSITIVE_KEYS.some((item) => normalized.includes(item.replace(/[-_]/g, '')));
}

export function sanitizeObject<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeObject(item)) as T;
    }

    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            result[key] = isSensitiveKey(key)
                ? '***'
                : sanitizeObject(item);
        }
        return result as T;
    }

    return value;
}
