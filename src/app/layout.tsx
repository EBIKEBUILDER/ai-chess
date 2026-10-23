import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next.js 3D WebGL AI Chess Arena",
  description:
    "Lightweight Procedural 3D WebGL Chess Platform with Stateful Google Gemini Interactions API (gemini-4-argon & gemini-3.8-flash) and OpenAI Responses API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
