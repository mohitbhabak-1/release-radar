import releases from "../data/releases.json";

// Placeholder until Phase 6: proves the build works and shows whether the pipeline has produced data yet.
export default function Home() {
  const count = (releases as { features: unknown[] }).features.length;
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Release Radar</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        {count === 0 ? "No release data yet. The pipeline hasn't produced a summary." : `${count} features.`}
      </p>
    </main>
  );
}
