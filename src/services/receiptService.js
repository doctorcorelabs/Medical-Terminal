import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const PRIMARY = [37, 99, 235]; // Indigo/Blue
const DARK = [30, 41, 59];
const MUTED = [100, 116, 139];
const WHITE = [255, 255, 255];
const SUCCESS = [34, 197, 94];

/**
 * Generates a professional PDF receipt for a subscription.
 * @param {Object} data - Subscription/Transaction data
 * @param {string} data.order_id - The gateway order ID (e.g., INV-...)
 * @param {string} data.user_name - Name of the user
 * @param {string} data.user_email - Email of the user
 * @param {string} data.plan_name - Name of the subscription plan
 * @param {number} data.amount - Amount paid
 * @param {string} data.payment_method - Payment method used
 * @param {string} data.date - Transaction date (ISO string or Date object)
 */
export const generateReceiptPDF = (data) => {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const dateStr = new Date(data.date || new Date()).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // 1. Header & Branding
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(...WHITE);
    doc.text('MedxTerminal', 20, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Efisiensi dalam setiap catatan medis.', 20, 28);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('KUITANSI PEMBAYARAN', pageWidth - 20, 20, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${data.order_id}`, pageWidth - 20, 28, { align: 'right' });

    // 2. Transaction Info Section
    let y = 55;
    
    // Left side: Bill To
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text('DIBAYAR OLEH:', 20, y);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(data.user_name || 'User Medx', 20, y + 6);
    doc.setTextColor(...MUTED);
    doc.text(data.user_email || '-', 20, y + 11);

    // Right side: Details
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.text('DETAIL TRANSAKSI:', pageWidth - 80, y);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text('Tanggal:', pageWidth - 80, y + 6);
    doc.text('Metode:', pageWidth - 80, y + 11);
    doc.text('Status:', pageWidth - 80, y + 16);

    doc.setTextColor(...DARK);
    doc.text(dateStr, pageWidth - 20, y + 6, { align: 'right' });
    doc.text(data.payment_method?.toUpperCase() || 'E-Wallet/QRIS', pageWidth - 20, y + 11, { align: 'right' });
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SUCCESS);
    doc.text('LUNAS / PAID', pageWidth - 20, y + 16, { align: 'right' });

    // 3. Table of Items
    y = 85;
    autoTable(doc, {
        startY: y,
        head: [['Deskripsi Layanan', 'Qty', 'Harga Satuan', 'Total']],
        body: [
            [
                { content: `Langganan MedxTerminal - Paket ${data.plan_name}\n(Akses penuh fitur Specialist & AI)`, styles: { halign: 'left' } },
                '1',
                `Rp ${Number(data.amount).toLocaleString('id-ID')}`,
                `Rp ${Number(data.amount).toLocaleString('id-ID')}`
            ]
        ],
        theme: 'striped',
        headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 5 },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 40, halign: 'right' },
            3: { cellWidth: 40, halign: 'right' }
        },
        margin: { left: 20, right: 20 }
    });

    // 4. Summary & Total
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setDrawColor(226, 232, 240);
    doc.line(pageWidth - 100, finalY, pageWidth - 20, finalY);
    
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Pembayaran:', pageWidth - 100, finalY + 10);
    doc.setFontSize(16);
    doc.setTextColor(...PRIMARY);
    doc.text(`Rp ${Number(data.amount).toLocaleString('id-ID')}`, pageWidth - 20, finalY + 10, { align: 'right' });

    // 5. Verification Check (The "buktibayar" part user asked for)
    const checkY = finalY + 30;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(20, checkY, pageWidth - 40, 25, 3, 3, 'F');
    
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.text('Catatan Penting:', 25, checkY + 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    const note = 'Kuitansi ini adalah bukti pembayaran yang sah. Simpan kuitansi ini untuk keperluan audit atau jika terjadi kendala pada sinkronisasi akun Anda. Hubungi support@daivanlabs.com untuk bantuan lebih lanjut.';
    const splitNote = doc.splitTextToSize(note, pageWidth - 50);
    doc.text(splitNote, 25, checkY + 13);

    // 6. Footer
    const footerY = 280;
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Diterbitkan secara otomatis oleh Sistem Penagihan MedxTerminal.', pageWidth / 2, footerY, { align: 'center' });
    doc.text(`© ${new Date().getFullYear()} DaivanLabs Digital Health.`, pageWidth / 2, footerY + 4, { align: 'center' });

    // Final Save
    doc.save(`Receipt-${data.order_id}.pdf`);
};
