// URL of the deployed Cloudflare Worker
const AI_WORKER_URL = 'https://medterminal-ai.daivanfebrijuansetiya.workers.dev';

async function callAI(messages, options = {}) {
    // If not using worker, you could fallback, but for security we enforce worker:
    const url = AI_WORKER_URL;
    const headers = {
        'Content-Type': 'application/json',
    };

    const body = {
        model: options.model || 'google/gemini-2.5-flash-lite-preview-09-2025',
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
            content: `Anda adalah asisten klinis AI. Berikan ringkasan klinis menggunakan bahasa formal dan istilah medis kedokteran yang tepat. Gunakan seluruh data yang diberikan (meliputi ringkasan, gejala, pemeriksaan fisik, lab, obat, dan catatan harian) sebagai konteks utama Anda untuk memberikan output summary detail terkait kondisi pasien. Format respons:

**Kondisi:** [Detail kondisi medis pasien saat ini secara klinis]
**Temuan Kritis:** [Detail temuan kritis/abnormal secara spesifik dari gejala, fisik, dan lab]
**Tindakan Selanjutnya:** [Rekomendasi penanganan medis/tindakan berikutnya sesuai panduan klinis]

Berikan respons yang detail, komprehensif, dan menggunakan terminologi medis baku.`
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
