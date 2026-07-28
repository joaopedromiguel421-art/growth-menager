import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Growth Manager",
    template: "%s · Growth Manager"
  },
  description: "Prioridades orgânicas explicáveis, execução aprovada e resultados comprovados."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
