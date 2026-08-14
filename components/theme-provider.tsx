"use client";

import { ThemeProvider as NextThemes } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      // Follow the OS until the user picks explicitly with the toggle.
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
