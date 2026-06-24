import Link from 'next/link';

export default function CasesPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Cases</h1>
      <p className="text-sm text-gray-500">
        Placeholder — list of cases will live here in M3.
      </p>
      <nav className="flex gap-4 text-sm">
        <Link className="underline" href="/dashboard">
          Back to dashboard
        </Link>
        <Link className="underline" href="/">
          Back home
        </Link>
      </nav>
    </main>
  );
}