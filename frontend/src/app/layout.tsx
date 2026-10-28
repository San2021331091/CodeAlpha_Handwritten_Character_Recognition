import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: "InkLab — Handwritten Character Recognition",
  description:
    "Draw a letter or digit. Explore a real convolutional neural network. CodeAlpha Machine Learning Task 3.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
