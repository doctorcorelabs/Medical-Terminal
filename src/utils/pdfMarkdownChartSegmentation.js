import { parseMedicalChartSegments } from './medicalChartParser.js';

export const CHART_MARKER_PREFIX = '__MEDICAL_CHART__';

export function buildPdfMarkdownFromSegments(rawText) {
    const parsed = parseMedicalChartSegments(rawText);

    const normalizedText = parsed.segments.map((segment) => {
        if (segment.type === 'chart') {
            const attrs = segment.attributes || {};
            const rawType = (attrs.type || '').toString().trim().toLowerCase();

            // Jika tipe kosong, treat seolah tidak ada chart sama sekali
            if (!rawType) {
                return '';
            }

            return `\n${CHART_MARKER_PREFIX}${segment.chartIndex}\n`;
        }

        if (segment.type === 'malformed-chart') {
            const marker = `[Visualisasi: Tag MedicalChart Tidak Valid | reason=${segment.reasonCode}]`;
            return `\n${marker}\n`;
        }

        return segment.content;
    }).join('');

    return {
        normalizedText,
        parsed,
    };
}
