import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseAIDiagnoses } from './dataService';

const PRIMARY = [37, 99, 235];
const DARK    = [30, 41, 59];
const MUTED   = [100, 116, 139];
const WHITE   = [255, 255, 255];
const STRIPE  = [248, 250, 252];
const SUCCESS = [34, 197, 94];
const WARNING = [245, 158, 11];
const DANGER  = [239, 68, 68];

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateTime(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function severityLabel(s) {
    if (s === 'berat') return 'Berat';
    if (s === 'sedang') return 'Sedang';
    return 'Ringan';
}

function conditionLabel(c) {
    const map = { critical: 'Kritis', urgent: 'Mendesak', stable: 'Stabil', improving: 'Membaik' };
    return map[c] || c || '-';
}

function genderLabel(g) {
    return g === 'female' ? 'Perempuan' : 'Laki-laki';
}

function sectionTitle(doc, title, y, pageWidth) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFillColor(...PRIMARY);
    doc.rect(14, y, 3, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(title, 20, y + 5.5);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y + 9, pageWidth - 14, y + 9);
    return y + 14;
}

function addFooters(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    const now = fmtDateTime(new Date().toISOString());
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.setFont('helvetica', 'normal');
        doc.text(`Dicetak dari MedTerminal - ${now}`, 14, 290);
        doc.text(`Halaman ${i} / ${pageCount}`, 196, 290, { align: 'right' });
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 286, 196, 286);
    }
}

function tbl(doc, opts) {
    const res = autoTable(doc, opts);
    return res?.finalY ?? doc.lastAutoTable?.finalY ?? opts.startY + 20;
}

export function exportPatientPDF(patient) {
    try {
        console.log('[PDF Export] Starting PDF generation for:', patient?.name);
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        let y = 14;

        // ===== HEADER =====
        doc.setFillColor(...PRIMARY);
        doc.rect(0, 0, pageWidth, 32, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(...WHITE);
        doc.text('MedTerminal', 14, 14);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('LAPORAN MEDIS PASIEN', 14, 21);
        doc.setFontSize(8);
        doc.text(`Dicetak: ${fmtDate(new Date().toISOString())}`, pageWidth - 14, 14, { align: 'right' });
        doc.text(`Nama: ${patient.name || '-'}`, pageWidth - 14, 21, { align: 'right' });
        doc.setFillColor(59, 130, 246);
        doc.rect(0, 32, pageWidth, 1.5, 'F');
        y = 42;

        // ===== 1. IDENTITAS PASIEN =====
        y = sectionTitle(doc, '1. Identitas Pasien', y, pageWidth);
        const identityData = [
            ['Nama Lengkap', patient.name || '-', 'Umur', patient.age ? `${patient.age} Tahun` : '-'],
            ['Jenis Kelamin', genderLabel(patient.gender), 'Gol. Darah', patient.bloodType || '-'],
            ['Tanggal Masuk', fmtDate(patient.admissionDate), 'Kondisi', conditionLabel(patient.condition)],
            ['Tinggi Badan', patient.height ? `${patient.height} cm` : '-', 'Berat Badan', patient.weight ? `${patient.weight} kg` : '-'],
            ['Diagnosis', patient.diagnosis || '-', 'Alergi', patient.allergies || 'Tidak ada'],
        ];
        y = tbl(doc, {
            startY: y, body: identityData, theme: 'plain',
            styles: { fontSize: 9, cellPadding: 2.5, textColor: DARK },
            columnStyles: {
                0: { fontStyle: 'bold', textColor: MUTED, cellWidth: 35 },
                1: { cellWidth: 50 },
                2: { fontStyle: 'bold', textColor: MUTED, cellWidth: 35 },
                3: { cellWidth: 50 },
            },
            margin: { left: 14, right: 14 },
        }) + 4;

        if (patient.chiefComplaint) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...MUTED);
            doc.text('Keluhan Utama:', 14, y + 2);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
            const lines = doc.splitTextToSize(patient.chiefComplaint, pageWidth - 28);
            doc.text(lines, 14, y + 7);
            y += 7 + lines.length * 4 + 2;
        }
        if (patient.medicalHistory) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...MUTED);
            doc.text('Riwayat Medis:', 14, y + 2);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
            const lines = doc.splitTextToSize(patient.medicalHistory, pageWidth - 28);
            doc.text(lines, 14, y + 7);
            y += 7 + lines.length * 4 + 4;
        }

        // ===== 2. TANDA VITAL =====
        y = sectionTitle(doc, '2. Tanda Vital', y, pageWidth);
        const vitals = [
            ['Detak Jantung', patient.heartRate ? `${patient.heartRate} bpm` : '-'],
            ['Tekanan Darah', patient.bloodPressure ? `${patient.bloodPressure} mmHg` : '-'],
            ['Suhu Tubuh', patient.temperature ? `${patient.temperature} \u00B0C` : '-'],
            ['Frek. Napas', patient.respRate ? `${patient.respRate} /min` : '-'],
            ['SpO2', patient.spO2 ? `${patient.spO2} %` : '-'],
        ];
        y = tbl(doc, {
            startY: y, head: [['Parameter', 'Nilai']], body: vitals, theme: 'grid',
            headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
            styles: { fontSize: 9, cellPadding: 3, textColor: DARK },
            alternateRowStyles: { fillColor: STRIPE },
            margin: { left: 14, right: 14 }, tableWidth: 100,
        }) + 6;

        // ===== 3. GEJALA =====
        const symptoms = patient.symptoms || [];
        y = sectionTitle(doc, `3. Gejala (${symptoms.length})`, y, pageWidth);
        if (symptoms.length > 0) {
            y = tbl(doc, {
                startY: y,
                head: [['No', 'Nama Gejala', 'Keparahan', 'Catatan', 'Tanggal']],
                body: symptoms.map((s, i) => [i + 1, s.name || '-', severityLabel(s.severity), s.notes || '-', fmtDateTime(s.recordedAt)]),
                theme: 'grid',
                headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
                styles: { fontSize: 8.5, cellPadding: 2.5, textColor: DARK },
                alternateRowStyles: { fillColor: STRIPE },
                columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 22, halign: 'center' }, 4: { cellWidth: 35 } },
                margin: { left: 14, right: 14 },
                didParseCell: (data) => {
                    if (data.section === 'body' && data.column.index === 2) {
                        const val = data.cell.raw;
                        if (val === 'Berat') data.cell.styles.textColor = DANGER;
                        else if (val === 'Sedang') data.cell.styles.textColor = WARNING;
                        else data.cell.styles.textColor = SUCCESS;
                        data.cell.styles.fontStyle = 'bold';
                    }
                },
            }) + 6;
        } else {
            doc.setFontSize(9); doc.setTextColor(...MUTED);
            doc.text('Tidak ada data gejala.', 14, y); y += 8;
        }

        // ===== 4. PEMERIKSAAN FISIK =====
        const physicals = patient.physicalExams || [];
        y = sectionTitle(doc, `4. Pemeriksaan Fisik (${physicals.length})`, y, pageWidth);
        if (physicals.length > 0) {
            y = tbl(doc, {
                startY: y,
                head: [['No', 'Sistem', 'Temuan', 'Tanggal']],
                body: physicals.map((e, i) => [i + 1, (e.system || '-').toUpperCase(), e.findings || '-', fmtDateTime(e.date)]),
                theme: 'grid',
                headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
                styles: { fontSize: 8.5, cellPadding: 2.5, textColor: DARK },
                alternateRowStyles: { fillColor: STRIPE },
                columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 25, fontStyle: 'bold' }, 3: { cellWidth: 35 } },
                margin: { left: 14, right: 14 },
            }) + 6;
        } else {
            doc.setFontSize(9); doc.setTextColor(...MUTED);
            doc.text('Tidak ada data pemeriksaan fisik.', 14, y); y += 8;
        }

        // ===== 5. HASIL LAB =====
        const labs = patient.supportingExams || [];
        y = sectionTitle(doc, `5. Hasil Laboratorium (${labs.length})`, y, pageWidth);
        if (labs.length > 0) {
            y = tbl(doc, {
                startY: y,
                head: [['No', 'Pemeriksaan', 'Nilai', 'Satuan', 'Status', 'Tanggal']],
                body: labs.map((e, i) => [i + 1, e.testName || '-', e.value || '-', e.unit || '-', e.result?.label || '-', fmtDateTime(e.date)]),
                theme: 'grid',
                headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
                styles: { fontSize: 8.5, cellPadding: 2.5, textColor: DARK },
                alternateRowStyles: { fillColor: STRIPE },
                columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 4: { cellWidth: 22, halign: 'center' }, 5: { cellWidth: 35 } },
                margin: { left: 14, right: 14 },
                didParseCell: (data) => {
                    if (data.section === 'body' && data.column.index === 4) {
                        const val = data.cell.raw;
                        if (val && val.includes('Tinggi')) data.cell.styles.textColor = DANGER;
                        else if (val && val.includes('Rendah')) data.cell.styles.textColor = WARNING;
                        else if (val === 'Normal') data.cell.styles.textColor = SUCCESS;
                        data.cell.styles.fontStyle = 'bold';
                    }
                },
            }) + 6;
        } else {
            doc.setFontSize(9); doc.setTextColor(...MUTED);
            doc.text('Tidak ada data hasil laboratorium.', 14, y); y += 8;
        }

        // ===== 6. RESEP OBAT =====
        const prescriptions = patient.prescriptions || [];
        y = sectionTitle(doc, `6. Resep Obat (${prescriptions.length})`, y, pageWidth);
        if (prescriptions.length > 0) {
            y = tbl(doc, {
                startY: y,
                head: [['No', 'Nama Obat', 'Dosis', 'Frekuensi', 'Rute', 'Tanggal']],
                body: prescriptions.map((p, i) => [i + 1, p.name || '-', p.dosage || '-', p.frequency || '-', (p.route || '-').toUpperCase(), fmtDateTime(p.date)]),
                theme: 'grid',
                headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
                styles: { fontSize: 8.5, cellPadding: 2.5, textColor: DARK },
                alternateRowStyles: { fillColor: STRIPE },
                columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 4: { cellWidth: 18, halign: 'center', fontStyle: 'bold' }, 5: { cellWidth: 35 } },
                margin: { left: 14, right: 14 },
            }) + 6;
        } else {
            doc.setFontSize(9); doc.setTextColor(...MUTED);
            doc.text('Tidak ada data resep obat.', 14, y); y += 8;
        }

        // ===== 7. LAPORAN HARIAN =====
        const reports = patient.dailyReports || [];
        y = sectionTitle(doc, `7. Laporan Harian (${reports.length})`, y, pageWidth);
        if (reports.length > 0) {
            y = tbl(doc, {
                startY: y,
                head: [['No', 'Tanggal', 'Catatan', 'Kondisi']],
                body: [...reports].reverse().map((r, i) => [i + 1, fmtDateTime(r.date), r.notes || '-', conditionLabel(r.condition)]),
                theme: 'grid',
                headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
                styles: { fontSize: 8.5, cellPadding: 2.5, textColor: DARK, overflow: 'linebreak' },
                alternateRowStyles: { fillColor: STRIPE },
                columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 35 }, 3: { cellWidth: 22, halign: 'center' } },
                margin: { left: 14, right: 14 },
            }) + 6;
        } else {
            doc.setFontSize(9); doc.setTextColor(...MUTED);
            doc.text('Tidak ada data laporan harian.', 14, y); y += 8;
        }

        // ===== 8. AI INSIGHTS =====
        const ai = patient.aiInsights || {};
        const hasAI = ai.summary || ai.soap || ai.symptoms;
        if (hasAI) {
            y = sectionTitle(doc, '8. AI Insights', y, pageWidth);
            const aiSections = [
                { key: 'summary', title: 'Ringkasan Cerdas' },
                { key: 'soap', title: 'Catatan SOAP' },
                { key: 'symptoms', title: 'Diagnosis Banding' },
            ];
            for (const sec of aiSections) {
                const text = ai[sec.key];
                if (!text) continue;
                if (y > 255) { doc.addPage(); y = 20; }
                doc.setFillColor(241, 245, 249);
                doc.rect(14, y, pageWidth - 28, 7, 'F');
                doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PRIMARY);
                doc.text(`> ${sec.title}`, 16, y + 5);
                y += 10;
                const clean = text.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/_{1,2}/g, '').replace(/`/g, '');
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
                const lines = doc.splitTextToSize(clean, pageWidth - 32);
                const lineHeight = 3.8;
                const totalHeight = lines.length * lineHeight;
                if (y + totalHeight > 280) {
                    let remaining = lines;
                    while (remaining.length > 0) {
                        const available = Math.floor((280 - y) / lineHeight);
                        if (available <= 0) { doc.addPage(); y = 20; continue; }
                        const batch = remaining.slice(0, available);
                        doc.text(batch, 16, y);
                        remaining = remaining.slice(available);
                        if (remaining.length > 0) { doc.addPage(); y = 20; }
                        else { y += batch.length * lineHeight + 4; }
                    }
                } else {
                    doc.text(lines, 16, y);
                    y += totalHeight + 6;
                }
            }
        }

        // ===== 9. PETA GEJALA (Native Drawing) =====
        const symptoms2 = patient.symptoms || [];
        if (symptoms2.length > 0) {
            doc.addPage();
            y = 20;
            y = sectionTitle(doc, '9. Peta Gejala', y, pageWidth);

            const cx = pageWidth / 2;
            const cy = y + 55;
            const nodeRadius = 38;

            // Center node (Pasien)
            doc.setFillColor(...PRIMARY);
            doc.circle(cx, cy, 12, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...WHITE);
            doc.text('Pasien', cx, cy + 1, { align: 'center' });

            const sevCol = {
                ringan: { bg: [209, 250, 229], border: [16, 185, 129], text: [6, 95, 70] },
                sedang: { bg: [254, 243, 199], border: [245, 158, 11], text: [146, 64, 14] },
                berat:  { bg: [254, 226, 226], border: [239, 68, 68], text: [153, 27, 27] },
            };

            const angleStep = (2 * Math.PI) / symptoms2.length;
            symptoms2.forEach((s, i) => {
                const angle = angleStep * i - Math.PI / 2;
                const nx = cx + nodeRadius * Math.cos(angle);
                const ny = cy + nodeRadius * Math.sin(angle);
                const col = sevCol[s.severity] || sevCol.sedang;

                // Edge line from center to node
                doc.setDrawColor(...col.border);
                doc.setLineWidth(s.severity === 'berat' ? 0.6 : 0.3);
                doc.line(cx, cy, nx, ny);

                // Node box
                doc.setFillColor(...col.bg);
                doc.setDrawColor(...col.border);
                doc.setLineWidth(0.5);
                doc.roundedRect(nx - 18, ny - 7, 36, 14, 3, 3, 'FD');

                // Label
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(...col.text);
                const name = s.name && s.name.length > 14 ? s.name.substring(0, 13) + '..' : (s.name || '-');
                doc.text(name, nx, ny - 1, { align: 'center' });
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(5.5);
                doc.text((s.severity || '').toUpperCase(), nx, ny + 4, { align: 'center' });
            });

            // AI DDx nodes (outer ring)
            const aiData = parseAIDiagnoses(patient.aiInsights?.symptoms);
            if (aiData && aiData.length > 0) {
                const diagRadius = nodeRadius + 35;
                const dAngle = (2 * Math.PI) / aiData.length;
                aiData.slice(0, 5).forEach((d, i) => {
                    const angle = dAngle * i - Math.PI / 4;
                    const dx = cx + diagRadius * Math.cos(angle);
                    const dy = cy + diagRadius * Math.sin(angle);

                    // Dashed line
                    doc.setDrawColor(251, 191, 36);
                    doc.setLineWidth(0.4);
                    doc.setLineDashPattern([1.5, 1], 0);
                    doc.line(cx, cy, dx, dy);
                    doc.setLineDashPattern([], 0);

                    // DDx node
                    doc.setFillColor(255, 251, 235);
                    doc.setDrawColor(245, 158, 11);
                    doc.setLineWidth(0.4);
                    doc.setLineDashPattern([1, 1], 0);
                    doc.roundedRect(dx - 20, dy - 9, 40, 18, 2, 2, 'FD');
                    doc.setLineDashPattern([], 0);

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(5);
                    doc.setTextColor(245, 158, 11);
                    doc.text('DDX', dx, dy - 3, { align: 'center' });
                    doc.setFontSize(6);
                    doc.setTextColor(146, 64, 14);
                    const dName = d.diagnosis.length > 16 ? d.diagnosis.substring(0, 15) + '..' : d.diagnosis;
                    doc.text(dName, dx, dy + 2, { align: 'center' });
                    doc.setFontSize(5);
                    doc.text(`${d.probability}%`, dx, dy + 6, { align: 'center' });
                });
            }

            y = cy + (aiData && aiData.length > 0 ? 80 : 50) + 10;

            // Legend
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            const legendItems = [
                { label: 'Ringan', color: [16, 185, 129] },
                { label: 'Sedang', color: [245, 158, 11] },
                { label: 'Berat', color: [239, 68, 68] },
            ];
            let lx = 14;
            legendItems.forEach(l => {
                doc.setFillColor(...l.color);
                doc.circle(lx + 2, y, 2, 'F');
                doc.setTextColor(...DARK);
                doc.text(l.label, lx + 6, y + 1);
                lx += 25;
            });
            y += 10;
        }

        // ===== 10. TIMELINE GEJALA =====
        if (symptoms2.length > 0) {
            if (y > 200) { doc.addPage(); y = 20; }
            y = sectionTitle(doc, '10. Timeline Gejala', y, pageWidth);

            const sorted = [...symptoms2].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
            const tlX = 24;
            const lineTop = y;

            // Admission marker
            if (patient.admissionDate) {
                doc.setFillColor(...PRIMARY);
                doc.circle(tlX, y + 2, 2.5, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(...PRIMARY);
                doc.text('Tanggal Masuk', tlX + 7, y + 2);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(...MUTED);
                doc.text(fmtDateTime(patient.admissionDate), tlX + 7, y + 6);
                y += 12;
            }

            sorted.forEach((s) => {
                if (y > 275) { doc.addPage(); y = 20; }
                const sevColor = s.severity === 'berat' ? DANGER : s.severity === 'sedang' ? WARNING : SUCCESS;

                // Dot on timeline
                doc.setFillColor(...sevColor);
                doc.circle(tlX, y + 2, 2, 'F');

                // Symptom name
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(...DARK);
                doc.text(s.name || '-', tlX + 7, y + 2);

                // Severity badge
                const badgeX = tlX + 7 + doc.getTextWidth(s.name || '-') + 3;
                doc.setFontSize(6);
                doc.setTextColor(...sevColor);
                doc.text((s.severity || '').toUpperCase(), badgeX, y + 2);

                // Date on right
                doc.setFontSize(6.5);
                doc.setTextColor(...MUTED);
                doc.text(fmtDateTime(s.recordedAt), pageWidth - 14, y + 2, { align: 'right' });

                // Notes
                if (s.notes) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7);
                    doc.setTextColor(...MUTED);
                    const noteLines = doc.splitTextToSize(s.notes, pageWidth - 50);
                    doc.text(noteLines, tlX + 7, y + 6);
                    y += 6 + noteLines.length * 3;
                }

                y += 8;
            });

            // Vertical timeline line
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(tlX, lineTop, tlX, y - 4);
            y += 4;
        }

        // ===== 11. RADAR DIAGNOSIS BANDING =====
        const aiDiag = parseAIDiagnoses(patient.aiInsights?.symptoms);
        if (aiDiag && aiDiag.length >= 3) {
            if (y > 140) { doc.addPage(); y = 20; }
            y = sectionTitle(doc, '11. Radar Diagnosis Banding', y, pageWidth);

            const rcx = pageWidth / 2;
            const rcy = y + 52;
            const rRadius = 42;
            const n = aiDiag.length;
            const rings = 4;

            // Draw grid rings (polygon)
            for (let r = 1; r <= rings; r++) {
                const rr = (rRadius / rings) * r;
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.2);
                const pts = [];
                for (let i = 0; i < n; i++) {
                    const angle = (2 * Math.PI / n) * i - Math.PI / 2;
                    pts.push({ x: rcx + rr * Math.cos(angle), y: rcy + rr * Math.sin(angle) });
                }
                for (let i = 0; i < pts.length; i++) {
                    const next = pts[(i + 1) % pts.length];
                    doc.line(pts[i].x, pts[i].y, next.x, next.y);
                }
            }

            // Draw axis lines
            for (let i = 0; i < n; i++) {
                const angle = (2 * Math.PI / n) * i - Math.PI / 2;
                const ex = rcx + rRadius * Math.cos(angle);
                const ey = rcy + rRadius * Math.sin(angle);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.2);
                doc.line(rcx, rcy, ex, ey);
            }

            // Calculate data polygon points
            const dataPoints = [];
            for (let i = 0; i < n; i++) {
                const angle = (2 * Math.PI / n) * i - Math.PI / 2;
                const val = Math.min(aiDiag[i].probability / 100, 1);
                dataPoints.push({
                    x: rcx + rRadius * val * Math.cos(angle),
                    y: rcy + rRadius * val * Math.sin(angle),
                });
            }

            // Fill polygon with semi-transparency using triangles
            doc.setGState(new doc.GState({ opacity: 0.2 }));
            doc.setFillColor(19, 109, 236);
            if (dataPoints.length >= 3) {
                for (let i = 1; i < dataPoints.length - 1; i++) {
                    doc.triangle(
                        dataPoints[0].x, dataPoints[0].y,
                        dataPoints[i].x, dataPoints[i].y,
                        dataPoints[i + 1].x, dataPoints[i + 1].y,
                        'F'
                    );
                }
            }
            doc.setGState(new doc.GState({ opacity: 1 }));

            // Outline
            doc.setDrawColor(19, 109, 236);
            doc.setLineWidth(0.6);
            for (let i = 0; i < dataPoints.length; i++) {
                const next = dataPoints[(i + 1) % dataPoints.length];
                doc.line(dataPoints[i].x, dataPoints[i].y, next.x, next.y);
            }

            // Data dots
            doc.setFillColor(19, 109, 236);
            dataPoints.forEach(p => {
                doc.circle(p.x, p.y, 1.2, 'F');
            });

            // Labels around the radar
            for (let i = 0; i < n; i++) {
                const angle = (2 * Math.PI / n) * i - Math.PI / 2;
                const labelR = rRadius + 10;
                const lbx = rcx + labelR * Math.cos(angle);
                const lby = rcy + labelR * Math.sin(angle);

                const diag = aiDiag[i].diagnosis;
                const displayName = diag.length > 18 ? diag.substring(0, 17) + '..' : diag;

                let align = 'center';
                if (Math.cos(angle) > 0.3) align = 'left';
                else if (Math.cos(angle) < -0.3) align = 'right';

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(71, 85, 105);
                doc.text(displayName, lbx, lby, { align });
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6);
                doc.setTextColor(...MUTED);
                doc.text(`${aiDiag[i].probability}%`, lbx, lby + 4, { align });
            }

            y = rcy + rRadius + 25;
        }

        // ===== FOOTERS =====
        addFooters(doc);

        // ===== SAVE =====
        const safeName = (patient.name || 'pasien').replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`Laporan_Medis_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
        console.log('[PDF Export] PDF generated successfully');
    } catch (err) {
        console.error('[PDF Export] Error generating PDF:', err);
        alert('Gagal membuat PDF: ' + err.message);
    }
}
