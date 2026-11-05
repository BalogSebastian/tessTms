import type { Metadata } from "next";
import "./globals.css";
import { TmsProvider } from "../components/platform/store";

export const metadata: Metadata = {
  title: "tessTMS | Műveleti központ",
  description: "Fuvarszervezési és vállalati műveleti központ.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body>
        <TmsProvider>{children}</TmsProvider>
      </body>
    </html>
  );
}
