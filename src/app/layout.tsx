import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Indian Monopoly Multiplayer Online",
  description:
    "A personal Indian property-trading game for private rooms with friends.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
