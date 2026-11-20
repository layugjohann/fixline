import type { ReactNode } from "react";
import { themeScript } from "./console/theme-script";

export const metadata = {
  title: "Fixline",
  description: "AI maintenance intake for Harbor Lane Property Management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets the console's `dark` class before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
        {children}
      </body>
    </html>
  );
}
