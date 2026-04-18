"use client";

import { useState } from "react";

const CMD = "npm i charli3-js";

export default function InstallPill() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  return (
    <button
      type="button"
      className="install-pill"
      onClick={copy}
      aria-label="copy install command"
    >
      <span className="install-prompt">$</span>
      <code className="install-cmd">{CMD}</code>
      <span className="install-copy">{copied ? "copied ✓" : "copy"}</span>
    </button>
  );
}
