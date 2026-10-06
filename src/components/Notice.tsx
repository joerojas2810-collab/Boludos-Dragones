"use client";

import { pushNotice, useProfile } from "@/lib/useProfile";

// Server rejection notice (remote mode): tap to dismiss.
export function Notice() {
  const { notice } = useProfile();
  if (!notice) return null;
  return (
    <button
      role="alert"
      className="fixed inset-x-0 top-0 z-50 bg-red-900 p-2 text-center text-sm text-white"
      onClick={() => pushNotice(null)}
    >
      {notice}
    </button>
  );
}
