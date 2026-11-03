import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">That page doesn't exist</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">The feature may have aged out of the lookback window.</p>
      <Link href="/" className="mt-4 inline-block text-indigo-700 underline underline-offset-2 dark:text-indigo-300">Back to Release Radar</Link>
    </main>
  );
}
