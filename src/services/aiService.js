const AI_WORKER_URL = localStorage.getItem('ai_worker_url') || '';
const OPENROUTER_KEY = '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';

async function callAI(messages, options = {}) {
    const url = AI_WORKER_URL || 'https://openrouter.ai/api/v1/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
    };

    if (!AI_WORKER_URL) {
        headers['Authorization'] = `Bearer ${OPENROUTER_KEY}`;
        headers['HTTP-Referer'] = window.location.origin;
    }

    const body = {
        model: options.model || 'google/gemini-2.5-flash-preview',
        messages,
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.3,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`AI API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'Tidak ada respons dari AI.';
    } catch (error) {
        console.error('AI Service Error:', error);
        throw error;
    }
}

export async function getSmartSummary(patientData) {
    const messages = [
        {
            role: 'system',
            content: `Anda adalah asisten klinis AI. Berikan ringkasan klinis dalam bahasa Indonesia yang terstruktur. Format respons:
**Kondisi:** [ringkasan kondisi pasien saat ini]
**Temuan Kritis:** [temuan kritis yang perlu diperhatikan]  
**Tindakan Selanjutnya:** [rekomendasi tindakan berikutnya]

Berikan respons singkat, padat, dan klinis.`
        },
        {
            role: 'user',
            content: `Berikan ringkasan klinis untuk pasien berikut:\n${JSON.stringify(patientData, null, 2)}`
        }
    ];
    return callAI(messages);
}

export async function getSymptomInsight(symptoms, patientInfo) {
    const messages = [
        {
            role: 'system',
            content: `Anda adalah asisten klinis AI. Analisis gejala pasien dan berikan insight dalam bahasa Indonesia. Format:
**Kemungkinan Diagnosis (DDx):**
1. [Diagnosis] - Probabilitas: [Tinggi/Sedang/Rendah]
2. ...

**Gejala Utama yang Mendukung:**
- [gejala dan korelasinya]

**Pemeriksaan yang Disarankan:**
- [pemeriksaan fisik/penunjang]

**Red Flags:**
- [tanda bahaya yang perlu diwaspadai]`
        },
        {
            role: 'user',
            content: `Pasien: ${patientInfo}\nGejala: ${symptoms.join(', ')}`
        }
    ];
    return callAI(messages);
}

export async function getDailyEvaluation(todayData, yesterdayData) {
    const messages = [
        {
            role: 'system',
            content: `Anda adalah asisten klinis AI. Bandingkan data klinis hari ini dengan kemarin dan berikan evaluasi dalam bahasa Indonesia. Format:
**Status:** [Membaik ✅ / Stabil ➡️ / Memburuk ⚠️]
**Perubahan Signifikan:**
- [detail perubahan vital signs, gejala, dll]

**Evaluasi:**
[analisis singkat perkembangan pasien]

**Rekomendasi:**
[saran tindak lanjut]`
        },
        {
            role: 'user',
            content: `Data Hari Ini:\n${JSON.stringify(todayData, null, 2)}\n\nData Kemarin:\n${JSON.stringify(yesterdayData, null, 2)}`
        }
    ];
    return callAI(messages);
}

export async function getPhysicalExamInsight(examData, symptoms) {
    const messages = [
        {
            role: 'system',
            content: `Anda adalah asisten klinis AI. Analisis hasil pemeriksaan fisik dan berikan insight dalam bahasa Indonesia. Hubungkan temuan pemeriksaan fisik dengan gejala pasien.`
        },
        {
            role: 'user',
            content: `Pemeriksaan Fisik: ${examData}\nGejala: ${symptoms}`
        }
    ];
    return callAI(messages);
}

export async function getSupportingExamInsight(labData, diagnosis) {
    const messages = [
        {
            role: 'system',
            content: `Anda adalah asisten klinis AI. Analisis hasil pemeriksaan penunjang (lab/imaging) dan berikan insight dalam bahasa Indonesia. Tandai nilai abnormal dan hubungkan dengan diagnosis kerja.`
        },
        {
            role: 'user',
            content: `Pemeriksaan Penunjang: ${labData}\nDiagnosis Kerja: ${diagnosis}`
        }
    ];
    return callAI(messages);
}

export async function getDrugInteraction(drugs) {
    const messages = [
        {
            role: 'system',
            content: `Anda adalah asisten farmakologi AI. Periksa interaksi antar obat dan berikan peringatan dalam bahasa Indonesia. Format:
**Status Interaksi:** [Aman ✅ / Perhatian ⚠️ / Kontraindikasi ❌]
**Detail Interaksi:**
- [obat A + obat B]: [jenis interaksi dan efeknya]

**Rekomendasi:**
[saran alternatif jika ada interaksi berbahaya]`
        },
        {
            role: 'user',
            content: `Periksa interaksi obat-obat berikut: ${drugs.join(', ')}`
        }
    ];
    return callAI(messages);
}

export async function getSOAPNote(patientData) {
    const messages = [
        {
            role: 'system',
            content: `Anda adalah asisten klinis AI. Buatkan catatan SOAP (Subjective, Objective, Assessment, Plan) dalam bahasa Indonesia berdasarkan data pasien.`
        },
        {
            role: 'user',
            content: `Buatkan catatan SOAP untuk pasien berikut:\n${JSON.stringify(patientData, null, 2)}`
        }
    ];
    return callAI(messages);
}
