import GoRide from "@/components/ui/goride";

// Portada de la landing (reemplaza a LandingHero desde 25-nov-2026): el hero
// "goride" de 21st.dev adaptado a Zplash. Mapa de Temuco con autos andando y un
// celular que muestra la cuenta de una patente (lavados que le quedan). Sin el
// menú propio del componente (arriba va SiteNav) y sin la pantalla de carga.
export default function HeroZplash() {
  return (
    <GoRide
      conMenu={false}
      conSplash={false}
      fondo="/tunel/prelavado-portada3.jpg"
      theme={{ accent: "#FFC72C", accentSoft: "#FFF1C7" }}
      brand={{ name: "Zplash", href: "/" }}
      copy={{
        headline: "Tu auto brillante,",
        phrases: ["en minutos.", "sin bajarte.", "sin reserva.", "todos los días."],
        phraseEvery: 2.8,
        lede: "Lavado exterior en túnel + aspirado autoservicio sin límite de tiempo. Llega sin reserva, abierto todos los días en Prieto Norte 71, Temuco.",
        primary: { label: "Ver precios", hover: "Compra por la web", href: "#lavados" },
        secondary: { label: "Cómo funciona", href: "#como-funciona" },
        stores: [],
        rating: "",
        ratingNote: "",
        stat: { value: "", label: "" },
        riders: [],
      }}
      live={{
        tag: "TEMUCO",
        cities: [
          // Cortos: el recuadro toma el ancho del más largo y en celular debe caber en una línea
          { name: "Full Túnel en minutos", rides: 0 },
          { name: "Aspirado autoservicio", rides: 0 },
          { name: "Abierto todos los días", rides: 0 },
        ],
        every: 3.2,
      }}
      tagline="Lavado por túnel · Temuco"
    />
  );
}
