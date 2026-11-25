// Links a las redes de Zplash, en el pie del sitio y en el menú del celular.
// Una red con url vacía no se muestra.
const REDES = [
  { nombre: "Instagram", url: "https://www.instagram.com/zplash.cl", Icono: InstagramIcon },
  { nombre: "TikTok", url: "", Icono: TikTokIcon },
];

export default function RedesSociales({ className = "redes-sociales" }: { className?: string }) {
  const visibles = REDES.filter((r) => r.url);
  if (visibles.length === 0) return null;
  return (
    <div className={className}>
      {visibles.map(({ nombre, url, Icono }) => (
        <a key={nombre} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Zplash en ${nombre}`} title={nombre}>
          <Icono />
        </a>
      ))}
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1-2.59-2.59 2.59 2.59 0 0 1 3.37-2.47V9.68a5.68 5.68 0 0 0-6.46 5.63 5.68 5.68 0 0 0 5.68 5.68 5.68 5.68 0 0 0 5.68-5.68V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.24-1.48Z" />
    </svg>
  );
}
