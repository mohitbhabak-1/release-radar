import "./globals.css";

export const metadata = { title: "Release Radar", description: "Upcoming and recently shipped BitGo features" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">{children}</body>
    </html>
  );
}
