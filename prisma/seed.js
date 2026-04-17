require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Memulai seeding database...");

  // ── 1. Buat Cabang ─────────────────────────────────────────
  const cabangUtama = await prisma.branch.upsert({
    where: { name: "Cabang Utama" },
    update: {},
    create: {
      name: "Cabang Utama",
      address: "Jl. Raya Frozen Food No. 1, Jakarta Selatan",
      phone: "021-12345678",
    },
  });

  const cabang2 = await prisma.branch.upsert({
    where: { name: "Cabang 2" },
    update: {},
    create: {
      name: "Cabang 2",
      address: "Jl. Frozen Food Raya No. 2, Jakarta Barat",
      phone: "021-87654321",
    },
  });

  console.log("✅ Cabang berhasil dibuat:", cabangUtama.name, "&", cabang2.name);

  // ── 2. Buat User ───────────────────────────────────────────
  const adminPassword = await bcrypt.hash("admin123", 12);
  const kasirPassword = await bcrypt.hash("kasir123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@posfrozen.com" },
    update: {},
    create: {
      name: "Admin Utama",
      email: "admin@posfrozen.com",
      password: adminPassword,
      role: "ADMIN",
      branchId: null, // Admin akses semua cabang
    },
  });

  const kasir1 = await prisma.user.upsert({
    where: { email: "kasir1@posfrozen.com" },
    update: {},
    create: {
      name: "Kasir Cabang Utama",
      email: "kasir1@posfrozen.com",
      password: kasirPassword,
      role: "KASIR",
      branchId: cabangUtama.id,
    },
  });

  const kasir2 = await prisma.user.upsert({
    where: { email: "kasir2@posfrozen.com" },
    update: {},
    create: {
      name: "Kasir Cabang 2",
      email: "kasir2@posfrozen.com",
      password: kasirPassword,
      role: "KASIR",
      branchId: cabang2.id,
    },
  });

  console.log("✅ User berhasil dibuat: Admin, Kasir1, Kasir2");

  // ── 3. Buat Kategori ───────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: "Daging & Unggas" },
      update: {},
      create: { name: "Daging & Unggas" },
    }),
    prisma.category.upsert({
      where: { name: "Seafood" },
      update: {},
      create: { name: "Seafood" },
    }),
    prisma.category.upsert({
      where: { name: "Siap Saji" },
      update: {},
      create: { name: "Siap Saji" },
    }),
    prisma.category.upsert({
      where: { name: "Sayuran & Buah" },
      update: {},
      create: { name: "Sayuran & Buah" },
    }),
  ]);

  const [catDaging, catSeafood, catSiapSaji, catSayur] = categories;
  console.log("✅ Kategori berhasil dibuat:", categories.map((c) => c.name).join(", "));

  // ── 4. Buat Produk ─────────────────────────────────────────
  const products = [
    { name: "Ayam Potong Frozen 1kg", price: 32000, categoryId: catDaging.id },
    { name: "Bakso Sapi Premium 500g", price: 28000, categoryId: catDaging.id },
    { name: "Nugget Ayam 400g", price: 25000, categoryId: catDaging.id },
    { name: "Sosis Sapi 500g", price: 22000, categoryId: catDaging.id },
    { name: "Udang Kupas Frozen 500g", price: 45000, categoryId: catSeafood.id },
    { name: "Cumi-Cumi Beku 500g", price: 38000, categoryId: catSeafood.id },
    { name: "Ikan Dori Fillet 500g", price: 35000, categoryId: catSeafood.id },
    { name: "Dimsum Mix 300g", price: 30000, categoryId: catSiapSaji.id },
    { name: "Gyoza Isi Ayam 200g", price: 27000, categoryId: catSiapSaji.id },
    { name: "Edamame Frozen 400g", price: 18000, categoryId: catSayur.id },
    { name: "Jagung Manis Pipilan 500g", price: 15000, categoryId: catSayur.id },
    { name: "Kentang Goreng Beku 1kg", price: 20000, categoryId: catSayur.id },
  ];

  const createdProducts = [];
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { name: p.name },
      update: {},
      create: p,
    });
    createdProducts.push(product);
  }

  console.log("✅ Produk berhasil dibuat:", createdProducts.length, "produk");

  // ── 5. Buat Stok per Cabang ────────────────────────────────
  const branches = [cabangUtama, cabang2];
  const stockData = [];

  for (const branch of branches) {
    for (const product of createdProducts) {
      const qty = Math.floor(Math.random() * 91) + 10; // stok acak 10-100
      const stock = await prisma.stock.upsert({
        where: {
          productId_branchId: {
            productId: product.id,
            branchId: branch.id,
          },
        },
        update: {},
        create: {
          productId: product.id,
          branchId: branch.id,
          quantity: qty,
          lowStockAlert: 10,
        },
      });

      // Catat stock log awal
      await prisma.stockLog.create({
        data: {
          type: "INITIAL",
          change: qty,
          noteBefore: 0,
          noteAfter: qty,
          note: "Stok awal seeding",
          productId: product.id,
          branchId: branch.id,
          userId: admin.id,
        },
      });

      stockData.push(stock);
    }
  }

  console.log("✅ Stok berhasil dibuat:", stockData.length, "entri stok");

  console.log("\n🎉 Seeding selesai!\n");
  console.log("=== AKUN LOGIN ===");
  console.log("Admin   : admin@posfrozen.com / admin123");
  console.log("Kasir 1 : kasir1@posfrozen.com / kasir123 (Cabang Utama)");
  console.log("Kasir 2 : kasir2@posfrozen.com / kasir123 (Cabang 2)");
  console.log("=================\n");
}

main()
  .catch((e) => {
    console.error("❌ Error saat seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
