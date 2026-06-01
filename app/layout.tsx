import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Email Tool - Resend & Supabase',
  description: 'Send personalized invitations with Resend and Supabase',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
