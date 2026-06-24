import Link from 'next/link';

export default function DashboardPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-sm text-gray-500">
        Placeholder — overview of your cases will live here in M3.
      </p>
      <nav className="flex gap-4 text-sm">
        <Link className="underline" href="/cases">
          View all cases
        </Link>
        <Link className="underline" href="/">
          Back home
        </Link>
      </nav>
    </main>
  );
}