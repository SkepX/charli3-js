"use client";

import { useEffect, useState } from "react";

const SECTIONS: { id: string; label: string }[] = [
  { id: "hero", label: "Live price" },
  { id: "loop", label: "How it works" },
  { id: "demo", label: "Run the loop" },
  { id: "invoice", label: "AI agent" },
  { id: "compare", label: "Python vs TS" },
  { id: "track3", label: "Track 3" },
];

export default function NavBar() {
  const [active, setActive] = useState<string>("hero");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#hero" className="nav-brand">
          <span className="nav-brand-dot" />
          charli3-js
        </a>
        <ul className="nav-links">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={`nav-link ${active === s.id ? "active" : ""}`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="nav-external">
          <a
            href="https://charli3-js-bc690dc5.mintlify.app/introduction"
            target="_blank"
            rel="noreferrer"
            className="nav-pill"
          >
            Docs
          </a>
          <a
            href="https://www.npmjs.com/package/charli3-js"
            target="_blank"
            rel="noreferrer"
            className="nav-pill"
          >
            npm
          </a>
          <a
            href="https://github.com/SkepX/charli3-js"
            target="_blank"
            rel="noreferrer"
            className="nav-pill"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
