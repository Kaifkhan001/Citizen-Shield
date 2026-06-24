import Link from 'next/link';

export default function NotFound(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Not found</h1>
      <p className="text-sm text-gray-500">The page you were looking for does not exist.</p>
      <Link className="underline text-sm" href="/">
        Back home
      </Link>
    </main>
  );
}
