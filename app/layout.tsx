import type { ReactNode } from "react";
import { themeScript } from "./console/theme-script";
import "./console/console.css";

export const metadata = {
  title: "Fixline",
  description: "AI maintenance intake for Harbor Lane Property Management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets the `dark` class before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
