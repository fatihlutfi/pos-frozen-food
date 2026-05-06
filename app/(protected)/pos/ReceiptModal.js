"use client";

import { useState } from "react";
import { formatRupiah, formatDateTime } from "@/lib/format";
import { printReceipt } from "@/lib/printReceipt";

const METHOD_LABEL = {
  CASH: "Tunai",
  TRANSFER_BANK: "Transfer Bank",
  QRIS: "QRIS",
};

export default function ReceiptModal({ transaction, onClose, onNewTransaction }) {
  const [paperSize, setPaperSize] = useState("58mm");

  if (!transaction) return null;

  const isOffline = transaction._offline === true;

  const {
    items, branch, user, invoiceNumber, paymentMethod,
    subtotal, discountAmount, grandTotal, amountPaid, changeAmount, createdAt,
  } = transaction;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">

        {/* ── Modal header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">
              {isOffline ? "Transaksi Disimpan Offline" : "Transaksi Berhasil!"}
            </h2>
            <p className={`text-xs mt-0.5 ${isOffline ? "text-orange-600" : "text-green-600"}`}>
              {isOffline
                ? "Akan dikirim ke server saat koneksi kembali"
                : "✓ Stok telah diperbarui"}
            </p>
          </div>
          <span className="text-3xl">{isOffline ? "📵" : "✅"}</span>
        </div>

        {/* ── Offline notice ── */}
        {isOffline && (
          <div className="px-5 py-2 bg-orange-50 border-b border-orange-100 text-xs text-orange-700 font-medium">
            Struk sementara — nomor invoice final akan dibuat saat sinkronisasi
          </div>
        )}

        {/* ── Receipt preview ── */}
        <div className="overflow-y-auto flex-1 px-4 py-4">
          {/* Paper size toggle */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 font-medium">Preview struk</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              {["58mm", "80mm"].map((s) => (
                <button
                  key={s}
                  onClick={() => setPaperSize(s)}
                  className={`px-3 py-1.5 cursor-pointer transition ${
                    paperSize === s ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Receipt card — mimics thermal paper */}
          <div
            className={`mx-auto bg-white border border-gray-200 shadow-sm font-mono text-black transition-all ${
              paperSize === "58mm" ? "max-w-[200px] text-[10.5px]" : "max-w-[260px] text-[11.5px]"
            }`}
            style={{ lineHeight: 1.5 }}
          >
            <div className="px-3 py-3 space-y-0.5">
              {/* Store header */}
              <p className="text-center font-extrabold tracking-widest" style={{ fontSize: "1.2em" }}>
                SURYA FROZEN
              </p>
              <p className="text-center text-gray-500 italic" style={{ fontSize: "0.88em" }}>
                Lengkap. Murah. Dekat.
              </p>
              {branch.address && (
                <p className="text-center text-gray-500" style={{ fontSize: "0.88em" }}>
                  {branch.address}
                </p>
              )}

              <Dash />

              <p className="text-center" style={{ fontSize: "0.88em" }}>WA: +6281973205141</p>
              <p className="text-center" style={{ fontSize: "0.88em" }}>Free Ongkir | Terima Pesanan</p>

              <Dash />

              <Row label="No. Invoice" value={invoiceNumber} bold />
              <Row label="Tanggal" value={formatDateTime(createdAt)} />
              <Row label="Kasir" value={user.name} />

              <Dash />

              {/* Items */}
              {items.map((item) => (
                <div key={item.id} className="my-1">
                  <p className="font-bold">{item.product.name}</p>
                  <Row
                    label={`${item.quantity} x ${formatRupiah(item.price)}`}
                    value={formatRupiah(item.subtotal)}
                    labelClass="text-gray-500"
                    bold
                  />
                </div>
              ))}

              <Dash />

              {/* Totals */}
              <Row label="Subtotal" value={formatRupiah(subtotal)} />
              {discountAmount > 0 && (
                <Row label="Diskon" value={`- ${formatRupiah(discountAmount)}`} valueClass="text-red-600" />
              )}

              <SolidLine />
              <Row
                label="TOTAL"
                value={formatRupiah(grandTotal)}
                bold
                style={{ fontSize: "1.15em" }}
              />
              <SolidLine />

              <div className="h-1" />
              <Row label="Pembayaran" value={METHOD_LABEL[paymentMethod]} bold />
              <Row label="Dibayar" value={formatRupiah(amountPaid)} />
              {changeAmount > 0 && (
                <Row label="Kembalian" value={formatRupiah(changeAmount)} bold />
              )}

              <Dash />

              {/* Footer */}
              <p className="text-center text-gray-500 mt-1" style={{ fontSize: "0.88em" }}>
                Terima kasih telah berbelanja!
              </p>
              <p className="text-center text-gray-500" style={{ fontSize: "0.88em" }}>
                Barang yang sudah dibeli
              </p>
              <p className="text-center text-gray-500" style={{ fontSize: "0.88em" }}>
                tidak dapat dikembalikan.
              </p>
              <div className="h-2" />
            </div>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
          <button
            onClick={() => printReceipt(transaction, paperSize)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition cursor-pointer"
          >
            🖨 Cetak Struk ({paperSize})
          </button>
          <button
            onClick={onNewTransaction}
            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition cursor-pointer"
          >
            Transaksi Baru
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

function Dash() {
  return <div className="border-t border-dashed border-gray-400 my-1.5" />;
}

function SolidLine() {
  return <div className="border-t border-gray-800 my-1" />;
}

function Row({ label, value, bold, valueClass = "", labelClass = "", style = {} }) {
  return (
    <div className="flex justify-between items-baseline gap-1" style={style}>
      <span className={`flex-1 ${labelClass} ${bold ? "font-bold" : ""}`}>{label}</span>
      <span className={`text-right whitespace-nowrap ${valueClass} ${bold ? "font-bold" : ""}`}>
        {value}
      </span>
    </div>
  );
}
