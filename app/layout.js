import { Geist } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata = {
  title: "POS Frozen Food",
  description: "Sistem Point of Sale untuk toko frozen food multi-cabang",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${geist.variable} h-full`}>
      <body className="h-full bg-gray-50 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
