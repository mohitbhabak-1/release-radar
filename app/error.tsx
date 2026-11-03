"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">The page couldn't be displayed. Try again, and report it if it keeps happening.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Try again</button>
    </main>
  );
}
