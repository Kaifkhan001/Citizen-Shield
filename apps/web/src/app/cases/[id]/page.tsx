import Link from 'next/link';

type Params = { id: string };

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<Params>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Case</h1>
      <p className="text-sm text-gray-500">
        Placeholder — case detail view will live here in M3.
      </p>
      <p className="rounded border border-gray-200 px-3 py-1 font-mono text-xs dark:border-gray-800">
        id: {id}
      </p>
      <nav className="flex gap-4 text-sm">
        <Link className="underline" href="/cases">
          Back to cases
        </Link>
        <Link className="underline" href="/">
          Back home
        </Link>
      </nav>
    </main>
  );
}