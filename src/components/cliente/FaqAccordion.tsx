"use client";

import { useState } from "react";

export default function FaqAccordion({
  preguntas,
}: {
  preguntas: { q: string; a: string | string[] }[];
}) {
  const [abierta, setAbierta] = useState<number | null>(0);

  return (
    <div className="card">
      {preguntas.map((p, i) => {
        const open = abierta === i;
        return (
          <div className="faq-item" key={p.q}>
            <button
              type="button"
              className={`faq-question${open ? " open" : ""}`}
              onClick={() => setAbierta(open ? null : i)}
            >
              {p.q}
              <span className="chev">▾</span>
            </button>
            {open && (
              <div className="faq-answer">
                {Array.isArray(p.a) ? (
                  <ul className="faq-answer-list">
                    {p.a.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  p.a
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
