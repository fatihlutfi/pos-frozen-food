import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// Thresholds untuk analisis produk
const HIGH_STOCK_THRESHOLD = 20;
const LOW_SALES_THRESHOLD = 3;

// Hitung range periode sebelumnya berdasarkan dateFrom & dateTo
function getPrevPeriod(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return null;
  const from = new Date(dateFrom);
  const to   = new Date(dateTo);
  to.setHours(23, 59, 59, 999);
  const diffMs  = to - from;
  const prevTo  = new Date(from.getTime() - 1);          // 1ms sebelum from
  const prevFrom = new Date(prevTo.getTime() - diffMs);   // sama panjang
  return { gte: prevFrom, lte: prevTo };
}

// Build product qty map dari transactions
function buildQtyMap(transactions) {
  const map = {};
  for (const t of transactions) {
    for (const item of t.items) {
      const id = item.productId;
      map[id] = (map[id] || 0) + item.quantity;
    }
  }
  return map;
}

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  const isAdmin = session.user.role === "ADMIN";
  const branchId = isAdmin
    ? searchParams.get("branchId") || undefined
    : session.user.branchId;

  const dateFrom = searchParams.get("dateFrom");
  const dateTo   = searchParams.get("dateTo");
  const paymentMethod = searchParams.get("paymentMethod") || undefined;

  const dateFilter =
    dateFrom || dateTo
      ? {
          gte: dateFrom ? new Date(dateFrom) : undefined,
          lte: dateTo ? new Date(new Date(dateTo).setHours(23, 59, 59, 999)) : undefined,
        }
      : undefined;

  const where = {
    status: "COMPLETED",
    ...(branchId ? { branchId } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  // Periode sebelumnya (untuk trend)
  const prevDateFilter = getPrevPeriod(dateFrom, dateTo);
  const prevWhere = prevDateFilter
    ? {
        status: "COMPLETED",
        ...(branchId ? { branchId } : {}),
        createdAt: prevDateFilter,
      }
    : null;

  const itemSelect = {
    quantity: true, price: true, subtotal: true,
    costPrice: true, discountPercent: true,
    productId: true,
    product: { select: { id: true, name: true } },
  };

  // Fetch periode ini + periode sebelumnya + produk aktif secara paralel
  const [transactions, prevTransactions, allActiveProducts] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        items: { select: itemSelect },
        branch: { select: { name: true } },
        user:   { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prevWhere
      ? prisma.transaction.findMany({
          where: prevWhere,
          include: { items: { select: { quantity: true, productId: true } } },
        })
      : Promise.resolve([]),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true,
        stocks: {
          where: branchId ? { branchId } : {},
          select: { quantity: true },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Qty map periode sebelumnya (id → qty)
  const prevQtyMap = buildQtyMap(prevTransactions);

  // --- Summary ---
  const totalRevenue     = transactions.reduce((s, t) => s + t.grandTotal, 0);
  const totalTransactions = transactions.length;
  const totalDiscount    = transactions.reduce((s, t) => s + t.discountAmount, 0);
  const avgTransaction   = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;
  const totalItems       = transactions.reduce((s, t) => s + t.items.reduce((si, i) => si + i.quantity, 0), 0);
  const totalHPP         = transactions.reduce((s, t) => s + t.items.reduce((si, i) => si + i.costPrice * i.quantity, 0), 0);
  const netProfit        = totalRevenue - totalHPP;
  const marginPct        = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // --- By Payment Method ---
  const byPaymentMethod = {
    CASH: { count: 0, revenue: 0 },
    TRANSFER_BANK: { count: 0, revenue: 0 },
    QRIS: { count: 0, revenue: 0 },
  };
  for (const t of transactions) {
    byPaymentMethod[t.paymentMethod].count += 1;
    byPaymentMethod[t.paymentMethod].revenue += t.grandTotal;
  }

  // --- Product map ---
  const productMap = {};
  for (const t of transactions) {
    for (const item of t.items) {
      const { id, name } = item.product;
      if (!productMap[id]) productMap[id] = { id, name, qty: 0, revenue: 0, hpp: 0 };
      productMap[id].qty     += item.quantity;
      productMap[id].revenue += item.subtotal;
      productMap[id].hpp     += item.costPrice * item.quantity;
    }
  }
  for (const p of Object.values(productMap)) {
    p.profit    = p.revenue - p.hpp;
    p.marginPct = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;

    // Trend vs periode sebelumnya
    const prevQty = prevQtyMap[p.id] ?? 0;
    if (!prevDateFilter) {
      p.trend = null;
    } else if (prevQty === 0 && p.qty === 0) {
      p.trend = { direction: "stable", pct: 0, prevQty: 0 };
    } else if (prevQty === 0) {
      p.trend = { direction: "up", pct: null, prevQty: 0 }; // baru muncul
    } else {
      const pct = Math.round(((p.qty - prevQty) / prevQty) * 100);
      p.trend = {
        direction: pct > 0 ? "up" : pct < 0 ? "down" : "stable",
        pct,
        prevQty,
      };
    }
  }
  const soldProducts = Object.values(productMap);

  // --- Top Products ---
  const topProducts = [...soldProducts].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // --- Daily Sales ---
  const dailyMap = {};
  for (const t of transactions) {
    const day = new Date(t.createdAt).toISOString().slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { date: day, count: 0, revenue: 0, discount: 0 };
    dailyMap[day].count   += 1;
    dailyMap[day].revenue += t.grandTotal;
    dailyMap[day].discount += t.discountAmount;
  }
  const dailySales = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // --- By Branch ---
  let byBranch = null;
  if (isAdmin && !branchId) {
    const branchMap = {};
    for (const t of transactions) {
      const name = t.branch.name;
      if (!branchMap[name]) branchMap[name] = { name, count: 0, revenue: 0, discount: 0, hpp: 0 };
      branchMap[name].count   += 1;
      branchMap[name].revenue += t.grandTotal;
      branchMap[name].discount += t.discountAmount;
      branchMap[name].hpp     += t.items.reduce((s, i) => s + i.costPrice * i.quantity, 0);
    }
    for (const b of Object.values(branchMap)) {
      b.profit    = b.revenue - b.hpp;
      b.marginPct = b.revenue > 0 ? (b.profit / b.revenue) * 100 : 0;
    }
    byBranch = Object.values(branchMap).sort((a, b) => b.revenue - a.revenue);
  }

  // --- Transaction list ---
  const transactionList = transactions
    .map((t) => ({
      id: t.id,
      invoiceNumber: t.invoiceNumber,
      createdAt: t.createdAt,
      branchName: t.branch.name,
      userName: t.user.name,
      paymentMethod: t.paymentMethod,
      subtotal: t.subtotal,
      discountAmount: t.discountAmount,
      grandTotal: t.grandTotal,
      itemCount: t.items.reduce((s, i) => s + i.quantity, 0),
    }))
    .reverse();

  // --- Analisis Produk ---
  const currentStockMap = {};
  for (const p of allActiveProducts) {
    currentStockMap[p.id] = { name: p.name, currentStock: p.stocks.reduce((s, st) => s + st.quantity, 0) };
  }

  const topByQty = [...soldProducts]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)
    .map((p) => ({
      name: p.name, qty: p.qty, revenue: p.revenue,
      currentStock: currentStockMap[p.id]?.currentStock ?? 0,
      trend: p.trend,
    }));

  const bottomByQty = [...soldProducts]
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 5)
    .map((p) => {
      const currentStock = currentStockMap[p.id]?.currentStock ?? 0;
      return {
        name: p.name, qty: p.qty, revenue: p.revenue, currentStock,
        needsPromo: currentStock > HIGH_STOCK_THRESHOLD && p.qty <= LOW_SALES_THRESHOLD,
        trend: p.trend,
      };
    });

  const soldIds = new Set(soldProducts.map((p) => p.id));
  const stagnant = allActiveProducts
    .filter((p) => !soldIds.has(p.id))
    .map((p) => ({ name: p.name, currentStock: p.stocks.reduce((s, st) => s + st.quantity, 0) }))
    .filter((p) => p.currentStock > 0)
    .sort((a, b) => b.currentStock - a.currentStock);

  const profitByProduct = [...soldProducts]
    .sort((a, b) => b.profit - a.profit)
    .map((p) => ({
      name: p.name, qty: p.qty, revenue: p.revenue,
      hpp: p.hpp, profit: p.profit, marginPct: p.marginPct,
    }));

  return NextResponse.json({
    summary: { totalRevenue, totalTransactions, totalDiscount, avgTransaction, totalItems, totalHPP, netProfit, marginPct },
    byPaymentMethod,
    topProducts,
    dailySales,
    byBranch,
    transactionList,
    productAnalysis: { topByQty, bottomByQty, stagnant },
    profitByProduct,
    // Info periode untuk ditampilkan di UI
    periodInfo: prevDateFilter
      ? { prevFrom: prevDateFilter.gte.toISOString().slice(0, 10), prevTo: prevDateFilter.lte.toISOString().slice(0, 10) }
      : null,
  });
}
