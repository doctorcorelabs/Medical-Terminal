// netlify/functions/check-interactions.cjs
// Drug-drug interaction checker using NIH RxNorm + OpenFDA APIs (no API key needed)
// CommonJS format for maximum compatibility with netlify-cli / lambda-local

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';
const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json';

const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload.' }) };
    }

    const { drugs } = body;
    if (!drugs || !Array.isArray(drugs) || drugs.length < 2) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Berikan minimal dua nama obat dalam array "drugs".' }),
        };
    }

    const validDrugs = drugs.map(d => String(d).trim()).filter(d => d.length > 0);
    if (validDrugs.length < 2) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Berikan minimal dua nama obat yang tidak kosong.' }),
        };
    }

    try {
        // 1. Resolve drug names → RxCUIs via RxNorm
        const rxcuiMap = await getRxCUIs(validDrugs);
        const rxcuis = Object.values(rxcuiMap).filter(Boolean);

        // 2. Fetch label data from OpenFDA
        const fdaData = await fetchOpenFDAInteractions(rxcuis, validDrugs);

        if (fdaData.error) {
            if (fdaData.error.code === 'NOT_FOUND') {
                return {
                    statusCode: 200,
                    body: JSON.stringify({ interactions: [] }),
                };
            }
            return {
                statusCode: 502,
                body: JSON.stringify({ error: `OpenFDA error: ${fdaData.error.message}` }),
            };
        }

        // 3. Parse interaction mentions
        const interactions = parseInteractions(fdaData, rxcuiMap, validDrugs);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interactions }),
        };
    } catch (err) {
        console.error('check-interactions error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message || 'Terjadi kesalahan tidak terduga.' }),
        };
    }
};

// Convert drug names to RxCUIs via RxNorm approximateTerm
async function getRxCUIs(drugNames) {
    const rxcuiMap = {};
    for (const name of drugNames) {
        try {
            const url = `${RXNORM_BASE}/approximateTerm.json?term=${encodeURIComponent(name)}&maxEntries=1`;
            const res = await fetch(url);
            if (!res.ok) {
                rxcuiMap[name] = null;
                continue;
            }
            const data = await res.json();
            const candidate = data.approximateGroup && data.approximateGroup.candidate && data.approximateGroup.candidate[0];
            rxcuiMap[name] = (candidate && candidate.rxcui) ? candidate.rxcui : null;
        } catch {
            rxcuiMap[name] = null;
        }
    }
    return rxcuiMap;
}

// Query OpenFDA drug label API using RxCUIs and original name fallbacks
async function fetchOpenFDAInteractions(rxcuis, originalDrugNames) {
    if (rxcuis.length === 0 && originalDrugNames.length === 0) {
        return { results: [] };
    }

    const rxcuiParts = rxcuis.map(id => `openfda.rxcui:"${id}"`);
    const nameParts = originalDrugNames.map(name => {
        // Escape Lucene special chars in name
        const esc = name.replace(/[+\-&|!(){}[\]^"~*?:\\/\s]/g, '\\$&');
        return `(openfda.generic_name:"${esc}" OR openfda.brand_name:"${esc}")`;
    });

    const query = [...rxcuiParts, ...nameParts].join('+OR+');
    const url = `${OPENFDA_BASE}?search=(${query})&limit=200`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 404) {
                return { error: { code: 'NOT_FOUND', message: 'No labels found.' } };
            }
            let msg = res.statusText;
            try {
                const errBody = await res.json();
                msg = (errBody && errBody.error && errBody.error.message) ? errBody.error.message : msg;
            } catch (_) { /* ignore parse error */ }
            return { error: { code: String(res.status), message: msg } };
        }
        return await res.json();
    } catch (err) {
        return { error: { code: 'FETCH_FAILED', message: err.message } };
    }
}

// Scan label drug_interactions text for mentions of other input drugs
function parseInteractions(apiResponse, rxcuiMap, originalDrugNames) {
    const interactions = [];
    if (!apiResponse.results || apiResponse.results.length === 0) return interactions;

    const inputRxCUIs = new Set(Object.values(rxcuiMap).filter(Boolean));
    const drugByRxcui = {};
    for (const name of Object.keys(rxcuiMap)) {
        if (rxcuiMap[name]) drugByRxcui[rxcuiMap[name]] = name;
    }

    for (const label of apiResponse.results) {
        const labelRxCUIs = (label.openfda && label.openfda.rxcui) ? label.openfda.rxcui : [];
        const interactionText = ((label.drug_interactions || []).join(' ')).toLowerCase();
        if (!interactionText) continue;

        const labelBrandsLower = ((label.openfda && label.openfda.brand_name) ? label.openfda.brand_name : []).map(n => n.toLowerCase());
        const labelGenericsLower = ((label.openfda && label.openfda.generic_name) ? label.openfda.generic_name : []).map(n => n.toLowerCase());

        // Determine which input drug(s) this label belongs to
        const labelDrugsSet = new Set();
        for (const rxcui of labelRxCUIs) {
            if (inputRxCUIs.has(rxcui) && drugByRxcui[rxcui]) {
                labelDrugsSet.add(drugByRxcui[rxcui]);
            }
        }
        for (const inputName of originalDrugNames) {
            if (!labelDrugsSet.has(inputName)) {
                const lower = inputName.toLowerCase();
                if (labelBrandsLower.includes(lower) || labelGenericsLower.includes(lower)) {
                    labelDrugsSet.add(inputName);
                }
            }
        }

        if (labelDrugsSet.size === 0) continue;

        const primaryDrugs = Array.from(labelDrugsSet);

        // Check if this label's interaction text mentions any OTHER input drug
        for (const otherDrug of originalDrugNames) {
            if (primaryDrugs.includes(otherDrug)) continue;
            if (!interactionText.includes(otherDrug.toLowerCase())) continue;

            for (const primaryDrug of primaryDrugs) {
                const pair = [primaryDrug, otherDrug].sort();
                const alreadyAdded = interactions.some(
                    i => i.pair[0] === pair[0] && i.pair[1] === pair[1]
                );
                if (!alreadyAdded) {
                    const fullText = (label.drug_interactions || []).join(' ');
                    interactions.push({
                        pair,
                        severity: 'Unknown',
                        description: fullText,
                    });
                }
            }
        }
    }

    return interactions;
}

module.exports = { handler };
