import type { Metadata } from "next";
import { Anuphan } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const anuphan = Anuphan({ subsets: ["thai", "latin"], weight: "variable", display: "swap", variable: "--font-anuphan" });

export const metadata: Metadata = {
  title: "น้ำสมุทรปราการ | รายงานและติดตามระดับน้ำ",
  description: "รายงานระดับน้ำ ดูแผนที่สถานการณ์ล่าสุด และติดตามข้อมูลน้ำท่วมในจังหวัดสมุทรปราการ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th" className={anuphan.variable}><body>{children}</body></html>;
}
