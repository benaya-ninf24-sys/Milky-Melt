import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Milky Melt — Ice Cream Sandwich",
  description: "Pre-order es gabin lembut dan manis untuk jadwal ready harianmu."
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
