const VALID_CATEGORIES = new Set(['pasien', 'operasi', 'rapat', 'jaga', 'pribadi', 'lainnya']);
const VALID_PRIORITIES = new Set(['rendah', 'sedang', 'tinggi']);

function isValidDateString(dateStr) {
    if (typeof dateStr !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidTimeString(timeStr) {
    return typeof timeStr === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr);
}

function toSafeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeScheduleItem(rawItem, index) {
    const row = index + 1;
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        return {
            valid: false,
            row,
            error: 'Item harus berupa object JSON.',
        };
    }

    const title = toSafeString(rawItem.title);
    if (!title) {
        return {
            valid: false,
            row,
            error: 'Field `title` wajib diisi.',
        };
    }

    const date = toSafeString(rawItem.date);
    if (!isValidDateString(date)) {
        return {
            valid: false,
            row,
            error: 'Field `date` harus format YYYY-MM-DD.',
        };
    }

    const warnings = [];
    const isAllDay = Boolean(rawItem.isAllDay);
    const startTime = isAllDay ? '' : toSafeString(rawItem.startTime);
    const endTime = isAllDay ? '' : toSafeString(rawItem.endTime);

    if (!isAllDay && startTime && !isValidTimeString(startTime)) {
        return {
            valid: false,
            row,
            error: 'Field `startTime` harus format HH:mm.',
        };
    }

    if (!isAllDay && endTime && !isValidTimeString(endTime)) {
        return {
            valid: false,
            row,
            error: 'Field `endTime` harus format HH:mm.',
        };
    }

    let normalizedEndTime = endTime;
    if (!isAllDay && startTime && endTime && endTime < startTime) {
        normalizedEndTime = '';
        warnings.push('`endTime` lebih kecil dari `startTime`, nilai `endTime` dikosongkan.');
    }

    const categoryInput = toSafeString(rawItem.category);
    const category = VALID_CATEGORIES.has(categoryInput) ? categoryInput : 'lainnya';
    if (categoryInput && category !== categoryInput) {
        warnings.push('Kategori tidak dikenal, diset ke `lainnya`.');
    }

    const priorityInput = toSafeString(rawItem.priority);
    const priority = VALID_PRIORITIES.has(priorityInput) ? priorityInput : 'sedang';
    if (priorityInput && priority !== priorityInput) {
        warnings.push('Prioritas tidak dikenal, diset ke `sedang`.');
    }

    const normalized = {
        id: toSafeString(rawItem.id) || crypto.randomUUID(),
        title,
        description: toSafeString(rawItem.description),
        date,
        startTime,
        endTime: normalizedEndTime,
        isAllDay,
        category,
        patientId: toSafeString(rawItem.patientId),
        priority,
        createdAt: toSafeString(rawItem.createdAt) || new Date().toISOString(),
    };

    return {
        valid: true,
        row,
        value: normalized,
        warnings,
    };
}

function pickSchedulesArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object' && Array.isArray(payload.schedules)) return payload.schedules;
    return null;
}

export function parseImportedScheduleJson(rawText) {
    let payload;
    try {
        payload = JSON.parse(rawText);
    } catch {
        return {
            ok: false,
            error: 'File JSON tidak valid. Pastikan format JSON benar.',
            validItems: [],
            invalidItems: [],
            warnings: [],
            totalItems: 0,
            duplicateIdsUpdated: 0,
        };
    }

    const schedules = pickSchedulesArray(payload);
    if (!schedules) {
        return {
            ok: false,
            error: 'Format tidak didukung. Gunakan array jadwal atau object dengan field `schedules`.',
            validItems: [],
            invalidItems: [],
            warnings: [],
            totalItems: 0,
            duplicateIdsUpdated: 0,
        };
    }

    const invalidItems = [];
    const warnings = [];
    const byId = new Map();
    let duplicateIdsUpdated = 0;

    schedules.forEach((item, index) => {
        const normalized = normalizeScheduleItem(item, index);
        if (!normalized.valid) {
            invalidItems.push({
                row: normalized.row,
                reason: normalized.error,
            });
            return;
        }

        if (byId.has(normalized.value.id)) {
            duplicateIdsUpdated += 1;
            warnings.push(`Baris ${normalized.row}: id duplikat terdeteksi, data terakhir dipakai.`);
        }

        byId.set(normalized.value.id, normalized.value);
        normalized.warnings.forEach(msg => warnings.push(`Baris ${normalized.row}: ${msg}`));
    });

    const validItems = Array.from(byId.values());

    return {
        ok: true,
        error: '',
        totalItems: schedules.length,
        validItems,
        invalidItems,
        warnings,
        duplicateIdsUpdated,
    };
}

export function getScheduleTemplateJson() {
    return JSON.stringify({
        version: 'medterminal-schedule-v1',
        generatedAt: new Date().toISOString(),
        schedules: [
            {
                id: crypto.randomUUID(),
                title: 'Visit pasien ICU Bed 3',
                description: 'Evaluasi klinis pagi + update instruksi terapi',
                date: '2026-03-15',
                startTime: '08:00',
                endTime: '09:00',
                isAllDay: false,
                category: 'pasien',
                patientId: '',
                priority: 'tinggi',
                createdAt: new Date().toISOString(),
            },
            {
                id: crypto.randomUUID(),
                title: 'Rapat koordinasi DPJP',
                description: 'Review kasus prioritas minggu ini',
                date: '2026-03-16',
                startTime: '',
                endTime: '',
                isAllDay: true,
                category: 'rapat',
                patientId: '',
                priority: 'sedang',
                createdAt: new Date().toISOString(),
            },
        ],
    }, null, 2);
}
