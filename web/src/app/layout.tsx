import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--nf-inter",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--nf-jakarta",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--nf-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Nova — AI-Powered Productivity for Everyone",
    template: "%s | Nova",
  },
  description:
    "Nova is the AI-powered productivity assistant that supercharges how you work, learn, and build. Join the waitlist for early access.",
  icons: {
    icon: "/NovaLogo.png",
    apple: "/NovaLogo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${plusJakarta.variable} ${instrumentSerif.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
