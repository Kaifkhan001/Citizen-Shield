import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Citizen Shield',
  description: 'Citizen Shield — protection at your fingertips.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
