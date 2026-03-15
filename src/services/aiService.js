// URL of the deployed Cloudflare Worker
const AI_WORKER_URL = import.meta.env.VITE_AI_WORKER_URL;
const AI_INTERNAL_KEY = import.meta.env.VITE_OPS_INTERNAL_KEY;

function validateWorkerUrl() {
    if (!AI_WORKER_URL || AI_WORKER_URL === 'undefined') {
        throw new Error('VITE_AI_WORKER_URL tidak dikonfigurasi. Pastikan environment variable terpasang pada build/deploy.');
    }
    try {
        const u = new URL(AI_WORKER_URL);
        if (u.origin === window.location.origin) {
            throw new Error('VITE_AI_WORKER_URL mengarah ke origin aplikasi — gunakan URL Cloudflare Workers lengkap.');
        }
    } catch (err) {
        // rethrow with friendlier message
        throw new Error(`VITE_AI_WORKER_URL tidak valid: ${err.message}`);
    }
}

function extractTextContent(content) {
    if (!content) return '';
    if (typeof content === 'string') return content.trim();

    if (Array.isArray(content)) {
        return content
            .map(item => {
                if (typeof item === 'string') return item;
                if (item?.type === 'text' && typeof item?.text === 'string') return item.text;
                if (typeof item?.text === 'string') return item.text;
                return '';
            })
            .filter(Boolean)
            .join('\n')
            .trim();
    }

    if (typeof content === 'object') {
        if (typeof content.text === 'string') return content.text.trim();
        if (Array.isArray(content.parts)) {
            return content.parts
                .map(part => (typeof part?.text === 'string' ? part.text : ''))
                .filter(Boolean)
                .join('\n')
                .trim();
        }
    }

    return '';
}

function extractAIMessage(data) {
    if (!data || typeof data !== 'object') return '';

    const choice = data.choices?.[0];
    const messageContent = extractTextContent(choice?.message?.content);
    if (messageContent) return messageContent;

    const choiceText = extractTextContent(choice?.text);
    if (choiceText) return choiceText;

    const topLevelContent = extractTextContent(data.content);
    if (topLevelContent) return topLevelContent;

    const outputText = extractTextContent(data.output_text);
    if (outputText) return outputText;

    const candidateText = data.candidates?.[0]?.content?.parts
        ?.map(part => (typeof part?.text === 'string' ? part.text : ''))
        ?.filter(Boolean)
        ?.join('\n')
        ?.trim();
    if (candidateText) return candidateText;

    return '';
}


async function callAI(messages, options = {}) {
    // Validate worker URL early to avoid accidental local POSTs
    validateWorkerUrl();
    const url = AI_WORKER_URL;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_INTERNAL_KEY}`,
        'x-internal-key': AI_INTERNAL_KEY,
    };


    // Inject anti-LaTeX format globally
    const processedMessages = messages.map(m => {
        if (m.role === 'system') {
            return { ...m, content: m.content + '\n\nPENTING: Dilarang keras menggunakan format rendering matematika LaTeX (seperti simbol $...$ atau \\circ) untuk angka, derajat suhu, maupun persentase. Tuliskan teks normal secara langsung (contoh: 38.5°C, 96%, 120/80 mmHg).' };
        }
        return m;
    });

    const body = {
        model: options.model || 'google/gemini-2.5-flash-lite-preview-09-2025',
        messages: processedMessages,
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.3,
    };

    try {
        if (!url || url === 'undefined') {
            throw new Error('VITE_AI_WORKER_URL belum dikonfigurasi.');
        }

        if (!AI_INTERNAL_KEY || AI_INTERNAL_KEY === 'undefined') {
            throw new Error('VITE_OPS_INTERNAL_KEY belum dikonfigurasi.');
        }

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
        if (data?.status === 'ok' && typeof data?.message === 'string' && /gateway is running/i.test(data.message)) {
            throw new Error('AI gateway mengembalikan endpoint health, bukan hasil chat completion. Periksa routing worker (POST / harus diproksikan ke OpenRouter).');
        }

        if (data?.error) {
            const errMessage = typeof data.error === 'string' ? data.error : data.error?.message;
            if (errMessage) {
                throw new Error(`AI Gateway: ${errMessage}`);
            }
        }

        const parsedText = extractAIMessage(data);
        if (parsedText) return parsedText;

        console.warn('AI response format not recognized:', data);
        return 'Respons AI kosong atau format respons belum dikenali.';
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
            content: `Anda adalah asisten klinis AI. Analisis gejala pasien dan berikan insight menggunakan bahasa formal, istilah medis baku, dalam bahasa Indonesia. Berikan minimal 5 kemungkinan diagnosis.

Format WAJIB (ikuti persis):
**Kemungkinan Diagnosis (DDx):**
1. [Nama Diagnosis Lengkap] - Probabilitas: [Tinggi/Sedang/Rendah]
   **Reasoning:** [Penjelasan klinis mengapa diagnosis ini mungkin berdasarkan gejala yang ada, mekanisme patofisiologi, dan temuan pendukung]
2. [Nama Diagnosis Lengkap] - Probabilitas: [Tinggi/Sedang/Rendah]
   **Reasoning:** [Penjelasan klinis...]
3. [Nama Diagnosis Lengkap] - Probabilitas: [Tinggi/Sedang/Rendah]
   **Reasoning:** [Penjelasan klinis...]
4. [Nama Diagnosis Lengkap] - Probabilitas: [Tinggi/Sedang/Rendah]
   **Reasoning:** [Penjelasan klinis...]
5. [Nama Diagnosis Lengkap] - Probabilitas: [Tinggi/Sedang/Rendah]
   **Reasoning:** [Penjelasan klinis...]

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

export async function getMedicationRecommendation(diagnosis, symptoms) {
    const messages = [
        {
            role: 'system',
            content: `Anda adalah asisten medis farmakologi AI. Berikan rekomendasi obat yang relevan berdasarkan diagnosis dan gejala pasien dalam bahasa Indonesia. Gunakan bahasa formal dan istilah medis.

Format WAJIB:
**Rekomendasi Terapi Farmakologis:**

1. **[Nama Golongan Obat]**
   - **Nama Obat:** [Nama Generik/Paten]
   - **Cara Kerja:** [Mekanisme farmakodinamik singkat]
   - **Sediaan & Dosis:** [Sediaan umum dan dosis lazim]
   - **Rute Pemberian:** [Oral/IV/IM dll]
   - **Kontraindikasi:** [Kondisi yang melarang penggunaan obat ini]

2. **[Nama Golongan Obat]**
   - ...

**Catatan Klinis:**
- [Peringatan atau hal yang perlu diwaspadai dari regimen di atas]`
        },
        {
            role: 'user',
            content: `Saya butuh rekomendasi obat untuk pasien dengan:
Diagnosis: ${diagnosis || 'Belum ditegakkan'}
Gejala: ${symptoms || 'Tidak spesifik'}`
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
