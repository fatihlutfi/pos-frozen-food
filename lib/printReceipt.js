/**
 * Shared receipt print utility.
 * Opens a new window with thermal-printer-ready HTML and triggers print.
 * Works from both POS (after checkout) and transaction history (reprint).
 */

const METHOD_LABEL = {
  CASH: "Tunai",
  TRANSFER_BANK: "Transfer Bank",
  QRIS: "QRIS",
};

function fmtRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount ?? 0);
}

function fmtDateTime(dateStr) {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}  ${time}`;
}

/**
 * @param {object} transaction  - full transaction object from API
 * @param {"58mm"|"80mm"} size  - paper width
 */
export function printReceipt(transaction, size = "80mm") {
  const {
    items,
    branch,
    user,
    invoiceNumber,
    paymentMethod,
    subtotal,
    discountAmount,
    grandTotal,
    amountPaid,
    changeAmount,
    createdAt,
  } = transaction;

  // Paper dimensions
  const bodyWidth = size === "58mm" ? 48 : 72; // mm, printable area
  const fs = size === "58mm" ? 11 : 12;         // base font-size px

  // Build items HTML
  const itemsHTML = items
    .map(
      (item) => `
      <div class="item">
        <span class="item-name">${escHtml(item.product.name)}</span>
        <div class="row">
          <span class="muted">${item.quantity} x ${fmtRupiah(item.price)}</span>
          <span class="b">${fmtRupiah(item.subtotal)}</span>
        </div>
      </div>`
    )
    .join("");

  const discountRow =
    discountAmount > 0
      ? `<div class="row red"><span>Diskon</span><span>- ${fmtRupiah(discountAmount)}</span></div>`
      : "";

  const changeRow =
    changeAmount > 0
      ? `<div class="row b"><span>Kembalian</span><span>${fmtRupiah(changeAmount)}</span></div>`
      : "";

  const addressLine =
    branch.address
      ? `<p class="c muted small">${escHtml(branch.address)}</p>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Struk ${escHtml(invoiceNumber)}</title>
  <style>
    @page {
      size: ${size} auto;
      margin: 3mm 2mm;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${fs}px;
      line-height: 1.45;
      width: ${bodyWidth}mm;
      color: #000;
      background: #fff;
    }
    .c  { text-align: center; }
    .b  { font-weight: bold; }
    .muted { color: #555; }
    .red   { color: #b00; }
    .small { font-size: ${fs - 1}px; }
    .store { font-size: ${fs + 4}px; font-weight: bold; letter-spacing: 1px; text-align: center; }
    .tagline { font-size: ${fs - 1}px; font-style: italic; text-align: center; color: #444; margin-top: 1px; }
    .branch-name { font-size: ${fs + 1}px; font-weight: 600; text-align: center; margin-top: 3px; }
    .contact { font-size: ${fs - 1}px; text-align: center; }

    .dash { border: none; border-top: 1px dashed #000; margin: 5px 0; }
    .solid { border: none; border-top: 1px solid #000; margin: 5px 0; }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 4px;
      margin: 2px 0;
    }
    .row span:first-child { flex: 1; }
    .row span:last-child  { white-space: nowrap; text-align: right; }

    .item        { margin: 3px 0 4px; }
    .item-name   { display: block; font-weight: bold; word-break: break-word; }

    .total-row {
      font-size: ${fs + 3}px;
      font-weight: bold;
      margin: 3px 0;
    }
    .footer {
      text-align: center;
      font-size: ${fs - 1}px;
      color: #444;
      margin-top: 6px;
      line-height: 1.6;
    }
    .spacer { height: 3px; }
  </style>
</head>
<body>

  <p class="store">SURYA FROZEN</p>
  <p class="tagline">Lengkap. Murah. Dekat.</p>
  <p class="branch-name">${escHtml(branch.name)}</p>
  ${addressLine}

  <div class="dash"></div>

  <p class="contact">WA: +6281973205141</p>
  <p class="contact">Free Ongkir | Terima Pesanan</p>

  <div class="dash"></div>

  <div class="row"><span>No. Invoice</span><span class="b">${escHtml(invoiceNumber)}</span></div>
  <div class="row"><span>Tanggal</span><span>${fmtDateTime(createdAt)}</span></div>
  <div class="row"><span>Kasir</span><span>${escHtml(user.name)}</span></div>

  <div class="dash"></div>

  ${itemsHTML}

  <div class="dash"></div>

  <div class="row"><span>Subtotal</span><span>${fmtRupiah(subtotal)}</span></div>
  ${discountRow}

  <div class="solid"></div>
  <div class="row total-row"><span>TOTAL</span><span>${fmtRupiah(grandTotal)}</span></div>
  <div class="solid"></div>

  <div class="spacer"></div>
  <div class="row"><span>Pembayaran</span><span class="b">${escHtml(METHOD_LABEL[paymentMethod])}</span></div>
  <div class="row"><span>Dibayar</span><span>${fmtRupiah(amountPaid)}</span></div>
  ${changeRow}

  <div class="dash"></div>

  <div class="footer">
    <p>Terima kasih telah berbelanja!</p>
    <p>Barang yang sudah dibeli tidak dapat dikembalikan.</p>
  </div>

</body>
</html>`;

  // Gunakan hidden iframe — tidak perlu izin popup, bekerja di tablet & mobile
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow.onload = function () {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    // Bersihkan iframe setelah print dialog ditutup
    iframe.contentWindow.addEventListener("afterprint", function () {
      document.body.removeChild(iframe);
    });
    // Fallback cleanup jika afterprint tidak ter-trigger
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    }, 30000);
  };
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
