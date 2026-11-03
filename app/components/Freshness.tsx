"use client";

import { useEffect, useState } from "react";

const STALE_AFTER_HOURS = 72; // a weekday cron that skipped a few days (or silently stopped) should look suspicious

/** Runs in the browser so staleness reflects when the page is viewed, not when it was built. */
export function Freshness({ generatedAt }: { generatedAt: string | null }) {
  const [hours, setHours] = useState<number | null>(null);
  useEffect(() => {
    if (generatedAt) setHours((Date.now() - new Date(generatedAt).getTime()) / 36e5);
  }, [generatedAt]);

  if (hours === null || hours < STALE_AFTER_HOURS) return null;
  return (
    <p role="status" className="mt-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      This page was last refreshed {Math.floor(hours / 24)} days ago. The scheduled refresh may not be running, so recent launches could be missing.
    </p>
  );
}
