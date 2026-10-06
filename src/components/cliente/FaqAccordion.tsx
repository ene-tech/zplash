"use client";

import { useState } from "react";

// Un paso de la respuesta puede ser texto o una captura de pantalla (ver
// public/faq): así un "cómo se hace" muestra la pantalla justo debajo del paso
// que la explica.
export type FaqItem = string | { src: string; alt: string };
export interface FaqPregunta {
  q: string;
  a: string | FaqItem[];
}

export default function FaqAccordion({ preguntas }: { preguntas: FaqPregunta[] }) {
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
                    {p.a.map((item, j) =>
                      typeof item === "string" ? (
                        <li key={j}>{item}</li>
                      ) : (
                        <li key={j} className="faq-captura">
                          {/* eslint-disable-next-line @next/next/no-img-element -- capturas chicas ya en webp */}
                          <img src={item.src} alt={item.alt} loading="lazy" />
                        </li>
                      )
                    )}
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
