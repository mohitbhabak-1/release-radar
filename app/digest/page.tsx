import { digestText } from "../../lib/digestText";
import { releases } from "../../lib/releases";
import { CopyButton } from "../components/CopyButton";

export const metadata = { title: "Release Radar digest" };

export default function Digest() {
  const text = digestText(releases);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <a href="/" className="text-sm text-indigo-700 underline underline-offset-2 dark:text-indigo-300">← Back to Release Radar</a>
        <CopyButton text={text} />
      </div>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{text}</pre>
    </main>
  );
}
