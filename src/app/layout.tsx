import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Hub Perso",
  description: "Hub personnel privé — emails, coffre-fort documents, finances",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body
        className={`${inter.variable} ${jakarta.variable} min-h-screen bg-[#0F0F11] font-sans text-[#FAFAFA] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
