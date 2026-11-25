'use client'

import { createContext, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type RefObject, type SVGProps, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, animate, domMax, m, type MotionValue, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react'
import { cn } from '@/lib/utils'
import Patente from '@/components/cliente/Patente'
import { ArrowUpRight, BatteryFull, Bike, Car, CarFront, Check, ChevronRight, Clock, Flag, LoaderCircle, MapPin, Menu, MessageCircle, Navigation, Phone, Share2, ShieldCheck, Signal, Star, Wifi, X } from 'lucide-react'

// ---------- config.ts ----------
/**
 * Every value a designer is likely to tune lives here. Colours are named for their role, so the
 * same markup survives a palette change
 */

// Written to --gr-* variables by index.tsx
const THEME = {
  // Outside the hero panel, and the paper the city is drawn on
  page: '#F4F0E8',
  panel: '#F8F5EE',
  card: '#FFFFFF',
  ink: '#14161B',
  grey: '#6B6F77',
  line: 'rgba(20, 22, 27, 0.08)',

  // GoRide yellow: the second headline line, the cars, the pin and the route
  accent: '#F6B51E',
  accentSoft: '#FDEFC8',

  // The app's own map, seen only through the phone
  mapBlock: '#ECE6DA',
  mapRoad: '#FFFFFF',
  mapPark: '#D7E4C4',
  mapWater: '#C3D9E4',

  // The paper city on the page: block tones, the river and the parks
  paperBlock: '#EFE8DC',
  paperWater: '#DCE5E9',
  paperPark: '#E1E6D3'
}

/** A text link. */
export interface GorideLink {
  /** Visible label. */
  label: string
  /** Link target. */
  href: string
}

/** A call-to-action button that rolls to a second label on hover. */
export interface GorideCta extends GorideLink {
  /** Second line that rolls in on hover. */
  hover: string
}

/** Brand shown in the navigation bar and on the splash screen. */
export interface GorideBrand {
  /** Wordmark text. */
  name: string
  /** Where the logo links to. */
  href: string
}

/** Navigation bar content. */
export interface GorideNav {
  /** Centre links (the first one is marked as the current page). */
  links: GorideLink[]
  /** Secondary link on the right. */
  signIn: GorideLink
  /** Primary call-to-action on the right. */
  cta: GorideCta
}

/** Hero copy. */
export interface GorideCopy {
  /** First (static) headline line. */
  headline: string
  /** Second headline line, in the accent colour, changes word by word through these. */
  phrases: string[]
  /** Seconds each phrase stays before the next one rolls in. */
  phraseEvery: number
  /** Supporting paragraph under the headline. */
  lede: string
  /** Primary hero button. */
  primary: GorideCta
  /** Secondary hero link. */
  secondary: GorideLink
  /** App store links; an `android` id uses the Play icon, anything else the Apple icon. */
  stores: { id: string; label: string; href: string }[]
  /** Average rating shown beside the stars. */
  rating: string
  /** Caption under the rating. */
  ratingNote: string
  /** A second figure shown beside the rating. */
  stat: { value: string; label: string }
  /** Avatar stack: `src` is any image URL or data URI. */
  riders: { name: string; src: string }[]
}

/** The live ticker above the headline. */
export interface GorideLive {
  /** Cities the ticker rotates through, each with its count of rides on the road. */
  cities: { name: string; rides: number }[]
  /** Zplash: texto de la etiqueta (antes "LIVE"). */
  tag: string
  /** Seconds per city. */
  every: number
}

/** The driver card shown once a ride is booked. */
export interface GorideDriver {
  /** Full name. */
  name: string
  /** Initials for the avatar. */
  initials: string
  /** Rating, for example `4.9`. */
  rating: string
  /** Trip count label. */
  trips: string
  /** Licence plate. */
  plate: string
  /** PIN a rider reads out at pickup. */
  pin: string
}

/** Payment line shown in the booking sheet. */
export interface GoridePayment {
  /** Payment method name. */
  method: string
  /** Note shown beside the method. */
  note: string
}

/** Zplash: lo que muestra el celular (la cuenta de una patente en vez de pedir un viaje). */
export interface GorideCuenta {
  /** Rótulo sobre el local. */
  lugarRotulo: string
  /** Local (reemplaza el barrio que cambiaba con el mapa). */
  lugar: string
  /** Segunda línea de la tarjeta de arriba. */
  horario: string
  /** Texto del globo sobre el pin. */
  pin: string
  /** Patente de ejemplo, se dibuja como placa chilena. */
  patente: string
  /** Plan y estado, en la etiqueta junto a la patente. */
  plan: string
  /** Lavados del mes y cuántos van usados. */
  total: number
  usados: number
  /** Línea bajo el contador. */
  nota: string
  /** Botón de abajo. */
  cta: GorideLink
  /** Las dos calles que se cruzan bajo el pin del celular: [la vertical, media cuadra a la derecha del pin; la horizontal, justo sobre el pin]. */
  calles: [string, string]
}

export interface GorideProps {
  /** Extra classes merged onto the root element. */
  className?: string
  /** Zplash: contenido de la cuenta que se ve en el celular. */
  cuenta?: Partial< GorideCuenta >
  /** Zplash: false oculta la barra de menú propia (la landing usa SiteNav). */
  conMenu?: boolean
  /** Zplash: false quita la pantalla de carga amarilla. */
  conSplash?: boolean
  /** Zplash: foto de fondo del hero, detrás del celular (tapa el mapa grande, se funde hacia el texto). */
  fondo?: string
  /** Colour roles written to the `--gr-*` variables; any omitted role keeps its default. */
  theme?: Partial< typeof THEME >
  /** Brand name and link. */
  brand?: Partial< GorideBrand >
  /** Navigation content. */
  nav?: Partial< GorideNav >
  /** Hero copy, rating and avatars. */
  copy?: Partial< GorideCopy >
  /** Live ticker cities. */
  live?: Partial< GorideLive >
  /** Driver card content. */
  driver?: Partial< GorideDriver >
  /** Payment line content. */
  payment?: Partial< GoridePayment >
  /** Tagline under the wordmark on the splash screen. */
  tagline?: string
  /** Forces reduced motion on or off; leave undefined to follow the visitor's system setting. */
  reducedMotion?: boolean
}

const EMPTY_LINK: GorideLink = { label: '', href: '#' }
const EMPTY_CTA: GorideCta = { label: '', hover: '', href: '#' }

const DEFAULT_CONTENT = {
  brand: { name: '', href: '#' } as GorideBrand,
  nav: { links: [], signIn: EMPTY_LINK, cta: EMPTY_CTA } as GorideNav,
  copy: {
    headline: '',
    phrases: [],
    phraseEvery: 2.8,
    lede: '',
    primary: EMPTY_CTA,
    secondary: EMPTY_LINK,
    stores: [],
    rating: '',
    ratingNote: '',
    stat: { value: '', label: '' },
    riders: []
  } as GorideCopy,
  live: { cities: [], every: 3.2, tag: 'HOY' } as GorideLive,
  driver: { name: '', initials: '', rating: '', trips: '', plate: '', pin: '' } as GorideDriver,
  payment: { method: '', note: '' } as GoridePayment,
  tagline: '',
  reducedMotion: undefined as boolean | undefined,
  conMenu: true,
  conSplash: true,
  fondo: '',
  cuenta: {
    lugarRotulo: 'Tu lavado',
    lugar: 'Zplash · Prieto Norte 71',
    horario: 'Abierto todos los días',
    pin: 'Zplash',
    patente: 'KZRT45',
    plan: 'Plan X5 · Vigente',
    total: 5,
    usados: 2,
    nota: 'Se renueva solo cada mes',
    cta: { label: 'Ver mi cuenta', href: '/cliente' },
    calles: ['Av. Balmaceda', 'Prieto Norte']
  } as GorideCuenta
}

type GorideContent = typeof DEFAULT_CONTENT

const GorideContext = createContext< GorideContent >(DEFAULT_CONTENT)

const useGoride = () => {
  const { brand: BRAND, nav: NAV, copy: COPY, live: LIVE, driver: DRIVER, payment: PAYMENT, tagline: TAGLINE, reducedMotion, cuenta: CUENTA, conMenu: CON_MENU, conSplash: CON_SPLASH, fondo: FONDO } = useContext(GorideContext)

  return { BRAND, NAV, COPY, LIVE, DRIVER, PAYMENT, TAGLINE, reducedMotion, CUENTA, CON_MENU, CON_SPLASH, FONDO }
}

// An explicit `reducedMotion` prop wins; otherwise the visitor's system setting decides
const useReducedMotionPref = () => {
  const { reducedMotion } = useGoride()
  const system = useMediaQuery('(prefers-reduced-motion: reduce)')

  return reducedMotion ?? system
}

/**
 * The city plan. Sizes are in px of the hero panel; positions are fractions of it, so the plan fits
 * any screen. `spacing` is one block, `angle` turns the street grid
 */
const CITY = {
  spacing: 46,
  spacingSmall: 38,

  // One block on screens 1800px and wider, so the city does not shrink into a fine grid
  spacingLarge: 58,
  angle: -12,

  // Every fourth street is a wide avenue
  avenueEvery: 4,

  // Where the grid is centred, as a fraction of the panel's height
  centerY: 0.55,

  // Written along the avenues, the way a printed city map names its main roads
  roads: ['Av. Alemania', 'Caupolicán', 'Prieto Norte', 'Av. Balmaceda', 'Manuel Montt', 'Claro Solar', 'Bulnes'],

  districts: [
    { name: 'Centro', x: 0.55, y: 0.26 },
    { name: 'Barrio Inglés', x: 0.87, y: 0.2 },
    { name: 'Pueblo Nuevo', x: 0.66, y: 0.56 },
    { name: 'Isla Cautín', x: 0.91, y: 0.66 },
    { name: 'Av. Alemania', x: 0.5, y: 0.84 },
    { name: 'Amanecer', x: 0.8, y: 0.93 }
  ],

  // Green blocks, as a fraction of the panel; each covers two blocks
  parks: [
    { x: 0.6, y: 0.4 },
    { x: 0.84, y: 0.82 },
    { x: 0.44, y: 0.62 },
    { x: 0.74, y: 0.12 }
  ]
}

// How much bigger the street looks through the phone than on the page
const LENS = {
  zoom: 1.45,

  // Height of the pickup pin on the phone's screen, as a fraction of the screen
  pinY: 0.43
}

const CARS = {
  // Vehicles in the city, shared out in turn between the ride types
  count: 12,

  // Blocks per second: cruising, and on the way to a pickup
  cruise: 0.9,
  dispatch: 2.4,

  // Minutes the app shows per block of distance
  minutesPerBlock: 0.45,

  // Cars within this many blocks of the pin count as nearby
  nearby: 6,

  // Cada cuántos segundos sale un auto hacia Zplash (cada vez desde otro lado), su velocidad, y
  // cuánto queda estacionado en el terreno antes de desvanecerse
  llegadaCada: 2.4,
  llegada: 1.8,
  parado: 1.4
}

// Ride types in the phone, each with its own vehicles in the city; `price` scales the Standard fare
const RIDES = [
  { id: 'car', label: 'Standard', price: 1, vehicle: 'White Toyota Camry' },
  { id: 'xl', label: 'XL', price: 1.45, vehicle: 'Black Chevy Suburban' },
  { id: 'bike', label: 'Bike', price: 0.5, vehicle: 'E-bike' }
]

// The Standard fare for a trip in dollars: a base plus a rate per block, and the trip's minutes per block
const FARE = {
  base: 4.5,
  perBlock: 0.85,
  minutesPerBlock: 0.6
}

const CURRENCY = { locale: 'en-US', code: 'USD' }

const BOOKING = {
  // 'Finding your driver' before a car is assigned, seconds
  search: 1.2,

  // How long 'Your ride is here' holds before the trip starts, and the drop-off message before it all resets
  pickup: 1.8,
  hold: 3.5,

  // How long the Book button has to be held, seconds
  press: 0.7
}

// The app's splash screen shows on the phone as it lands, then fades into the live map, seconds
const SPLASH = {
  // Full screen first, then it closes down onto the phone's screen and fades into the live map
  hold: 1.7,
  shrink: 0.9,
  fade: 0.45,

  // Below tablet the phone sits under the fold, so the splash is skipped and the hero comes straight in
  skip: '(max-width: 767px)'
}

// When the hero's own entrances start, so they play just as the splash lands in the phone, seconds
const INTRO_AT = SPLASH.hold + SPLASH.shrink * 0.6

const EASE_OUT = [0.22, 1, 0.36, 1] as const

// ---------- use-media-query.ts ----------
// Server render and first paint assume the query fails; the real value lands on hydration
const useMediaQuery = (query: string) => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)

      list.addEventListener('change', onChange)

      return () => list.removeEventListener('change', onChange)
    },
    [query]
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

// ---------- motion-provider.tsx ----------
/**
 * Loads Motion's animation, gesture, drag and layout features for the block's m
 * components. Under reduced motion, Motion drops every movement and keeps only the fades
 */
const MotionProvider = ({ children }: { children: ReactNode }) => {
  const { reducedMotion } = useGoride()

  return (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion={reducedMotion === undefined ? 'user' : reducedMotion ? 'always' : 'never'}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

// ---------- goride-apple-icon.tsx ----------
const GorideAppleIcon = (props: SVGProps< SVGSVGElement >) => {
  return (
    <svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
      <path d='M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65l.05-.04ZM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.6-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27Z' />
    </svg>
  )
}

// ---------- goride-bike-top.tsx ----------
// A scooter and its rider seen from above, nose pointing right: yellow helmet, black handlebar
const GorideBikeTop = (props: SVGProps< SVGSVGElement >) => {
  return (
    <svg viewBox='0 0 40 20' fill='none' aria-hidden {...props}>
      <rect x='3' y='7.5' width='33' height='5' rx='2.5' fill='#14161B' />
      <path d='M31 2.5v15' stroke='#14161B' strokeWidth='2.4' strokeLinecap='round' />
      <ellipse cx='18' cy='10' rx='6.5' ry='7.5' fill='#3A3D45' />
      <circle cx='20.5' cy='10' r='4.6' fill='#F6B51E' stroke='#14161B' strokeOpacity='0.3' />
      <rect x='35' y='8.5' width='3' height='3' rx='1' fill='#FFE7A6' />
    </svg>
  )
}

// ---------- goride-car-top.tsx ----------
// A white car seen from above, nose pointing right, so a rotation turns it along the street
const GorideCarTop = (props: SVGProps< SVGSVGElement >) => {
  return (
    <svg viewBox='0 0 44 24' fill='none' aria-hidden {...props}>
      <rect x='1' y='2' width='42' height='20' rx='8' fill='#FFFFFF' stroke='#14161B' strokeOpacity='0.2' />
      <path
        d='M28 5.5h4.5c2.6 0 4.5 2.9 4.5 6.5s-1.9 6.5-4.5 6.5H28c.9-2 1.4-4.2 1.4-6.5S28.9 7.5 28 5.5Z'
        fill='#14161B'
      />
      <path
        d='M9.5 6h3.2c-.8 1.8-1.2 3.8-1.2 6s.4 4.2 1.2 6H9.5C8 16.6 7.2 14.4 7.2 12S8 7.4 9.5 6Z'
        fill='#14161B'
        fillOpacity='0.85'
      />
      <rect x='14' y='6.5' width='12' height='11' rx='3' fill='#F2ECE1' />
      <rect x='40' y='4.5' width='2' height='4' rx='1' fill='#F6B51E' />
      <rect x='40' y='15.5' width='2' height='4' rx='1' fill='#F6B51E' />
    </svg>
  )
}

// ---------- goride-suv-top.tsx ----------
// A black SUV seen from above, nose pointing right: longer and boxier than the car, with roof rails
const GorideSuvTop = (props: SVGProps< SVGSVGElement >) => {
  return (
    <svg viewBox='0 0 50 26' fill='none' aria-hidden {...props}>
      <rect x='1' y='2' width='48' height='22' rx='6' fill='#22252B' stroke='#14161B' strokeOpacity='0.4' />
      <path d='M33 5h5c2.8 0 5 3.6 5 8s-2.2 8-5 8h-5c1-2.3 1.5-5 1.5-8S34 7.3 33 5Z' fill='#5B6270' />
      <path
        d='M8.5 5.5h3c-.8 2.2-1.2 4.8-1.2 7.5s.4 5.3 1.2 7.5h-3C7.3 18.6 6.6 15.9 6.6 13s.7-5.6 1.9-7.5Z'
        fill='#5B6270'
      />
      <rect x='14' y='6' width='17' height='14' rx='2.5' fill='#30343B' />
      <path d='M15 7.5h15M15 18.5h15' stroke='#8A919C' strokeWidth='1' strokeLinecap='round' />
      <rect x='46' y='4.5' width='2' height='4' rx='1' fill='#F6B51E' />
      <rect x='46' y='17.5' width='2' height='4' rx='1' fill='#F6B51E' />
    </svg>
  )
}

// ---------- goride-city-plan.tsx ----------
type GorideCityPlanProps = SVGProps< SVGSVGElement > & {
  // 'ink' is the paper map on the page; 'app' is the same streets in the app's colours, seen through the phone
  variant: 'ink' | 'app'
  width: number
  height: number
  spacing: number
  angle: number
  center: { x: number; y: number }
  reach: number
  avenueEvery: number
  river: string

  // Two-block parks, by the crossing at their top-left corner
  parks: { i: number; j: number }[]

  // District names, written small into the app's map only
  labels?: { name: string; x: number; y: number }[]

  // Road names, written along the avenues of the paper map
  roads?: string[]
}

const range = (reach: number) => Array.from({ length: reach * 2 + 1 }, (_, k) => k - reach)

// A steady pseudo-random 0–1 per block, so the paper tones never reshuffle between renders
const tone = (i: number, j: number) => {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453

  return n - Math.floor(n)
}

/**
 * The street grid as one drawing in panel px: toned blocks, parks and the river under it, avenues
 * wider than streets. Drawn twice from the same numbers, so the phone's view lines up with the page
 */
const GorideCityPlan = ({
  variant,
  width,
  height,
  spacing,
  angle,
  center,
  reach,
  avenueEvery,
  river,
  parks,
  labels = [],
  roads = [],
  ...props
}: GorideCityPlanProps) => {
  // Hooks
  const id = useId()

  // Vars
  const app = variant === 'app'
  const far = reach * spacing
  const lines = range(reach)
  const rad = (angle * Math.PI) / 180
  const gap = spacing * (app ? 0.1 : 0.09)

  // Paper blocks only where they can be seen, in a few tones from the same warm paper colour
  const blocks = app
    ? []
    : lines.flatMap(i =>
        lines
          .map(j => ({ i, j, shade: tone(i, j) }))
          .filter(({ i: bi, j: bj, shade }) => {
            const cx = center.x + (bi + 0.5) * spacing * Math.cos(rad) - (bj + 0.5) * spacing * Math.sin(rad)
            const cy = center.y + (bi + 0.5) * spacing * Math.sin(rad) + (bj + 0.5) * spacing * Math.cos(rad)

            return shade > 0.28 && cx > -spacing && cx < width + spacing && cy > -spacing && cy < height + spacing
          })
      )

  const avenues = lines.filter(k => k % avenueEvery === 0 && Math.abs(k) < reach - 1)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill='none' aria-hidden {...props}>
      <defs>
        <pattern id={id} width='7' height='7' patternUnits='userSpaceOnUse'>
          <circle cx='3.5' cy='3.5' r='0.9' className='fill-(--gr-ink)' fillOpacity='0.16' />
        </pattern>
      </defs>

      {app && <rect width={width} height={height} className='fill-(--gr-mapBlock)' />}

      <g transform={`translate(${center.x} ${center.y}) rotate(${angle})`}>
        {blocks.map(block => (
          <rect
            key={`${block.i}:${block.j}`}
            x={block.i * spacing + gap}
            y={block.j * spacing + gap}
            width={spacing - gap * 2}
            height={spacing - gap * 2}
            rx='2'
            className='fill-(--gr-paperBlock)'
            fillOpacity={0.35 + block.shade * 0.65}
          />
        ))}

        {parks.map(park => (
          <g key={`${park.i}:${park.j}`}>
            <rect
              x={park.i * spacing + gap}
              y={park.j * spacing + gap}
              width={spacing * 2 - gap * 2}
              height={spacing - gap * 2}
              rx={app ? spacing * 0.12 : 3}
              className={app ? 'fill-(--gr-mapPark)' : 'fill-(--gr-paperPark)'}
            />
            {!app && (
              <rect
                x={park.i * spacing + gap}
                y={park.j * spacing + gap}
                width={spacing * 2 - gap * 2}
                height={spacing - gap * 2}
                rx='3'
                fill={`url(#${id})`}
              />
            )}
          </g>
        ))}
      </g>

      {/* El río del componente original no se dibuja: no corresponde al entorno de Zplash */}

      <g transform={`translate(${center.x} ${center.y}) rotate(${angle})`}>
        {lines.map(k => {
          const avenue = k % avenueEvery === 0
          const stroke = app ? (avenue ? spacing * 0.32 : spacing * 0.2) : avenue ? spacing * 0.2 : 1
          const paint = app || avenue ? 'stroke-(--gr-mapRoad)' : 'stroke-(--gr-ink)'
          const opacity = app || avenue ? 1 : 0.07

          return (
            <g key={k}>
              <line
                x1={k * spacing}
                x2={k * spacing}
                y1={-far}
                y2={far}
                strokeWidth={stroke}
                className={paint}
                strokeOpacity={opacity}
              />
              <line
                x1={-far}
                x2={far}
                y1={k * spacing}
                y2={k * spacing}
                strokeWidth={stroke}
                className={paint}
                strokeOpacity={opacity}
              />
            </g>
          )
        })}

        {/* Each avenue carries its name once, along the road, like a printed map */}
        {!app &&
          roads.length > 0 &&
          avenues.map((k, index) => (
            <g key={`road-${k}`} className='fill-(--gr-ink)' fillOpacity='0.32'>
              <text
                x={k * spacing}
                y={(index % 2 ? 1.5 : -2.5) * spacing}
                transform={`rotate(-90 ${k * spacing} ${(index % 2 ? 1.5 : -2.5) * spacing})`}
                textAnchor='middle'
                dominantBaseline='central'
                fontSize={spacing * 0.17}
                fontWeight='600'
                letterSpacing='0.18em'
 >
                {roads[index % roads.length].toUpperCase()}
              </text>
              <text
                x={(index % 2 ? -1.5 : 2.5) * spacing}
                y={k * spacing}
                textAnchor='middle'
                dominantBaseline='central'
                fontSize={spacing * 0.17}
                fontWeight='600'
                letterSpacing='0.18em'
 >
                {roads[(index + 3) % roads.length].toUpperCase()}
              </text>
            </g>
          ))}
      </g>

      {app &&
        labels.map(label => (
          <text
            key={label.name}
            x={label.x}
            y={label.y}
            textAnchor='middle'
            className='fill-(--gr-ink) font-semibold'
            fillOpacity='0.5'
            fontSize={spacing * 0.2}
            letterSpacing='0.04em'
 >
            {label.name.toUpperCase()}
          </text>
        ))}
    </svg>
  )
}

// ---------- goride-logo-mark.tsx ----------
// The app's mark: a pickup pin on a yellow tile, drawn so it stays crisp at nav size
const GorideLogoMark = (props: SVGProps< SVGSVGElement >) => {
  return (
    <svg viewBox='0 0 24 24' fill='none' aria-hidden {...props}>
      <rect width='24' height='24' rx='7' fill='#F6B51E' />
      <path d='M12 4.8a6.4 6.4 0 0 0-1.6 12.6l3.1 2.4.4-2.6A6.4 6.4 0 0 0 12 4.8Z' fill='#14161B' />
      <circle cx='12' cy='11.2' r='2.3' fill='#F6B51E' />
    </svg>
  )
}

// ---------- goride-play-icon.tsx ----------
const GoridePlayIcon = (props: SVGProps< SVGSVGElement >) => {
  return (
    <svg viewBox='0 0 24 24' aria-hidden {...props}>
      <path d='M4.2 2.6 13.6 12l-9.4 9.4a1.6 1.6 0 0 1-.7-1.35V3.95c0-.56.27-1.06.7-1.35Z' fill='#00d7fe' />
      <path d='m16.8 8.8-3.2 3.2-9.4-9.4c.5-.33 1.17-.38 1.73-.06L16.8 8.8Z' fill='#00f076' />
      <path d='m16.8 15.2-11.07 6.26c-.56.32-1.23.27-1.73-.06l9.6-9.4 3.2 3.2Z' fill='#ff3a44' />
      <path d='m20.5 10.6-3.7-1.8-3.2 3.2 3.2 3.2 3.7-1.8c1.1-.62 1.1-2.18 0-2.8Z' fill='#ffd500' />
    </svg>
  )
}

// ---------- goride-route-layer.tsx ----------
type GorideRouteLayerProps = SVGProps< SVGSVGElement > & {
  // The dotted line from the pickup to a chosen drop-off, before booking
  previewRef: Ref< SVGPathElement >

  // The yellow line the booked ride is still to drive
  routeRef: Ref< SVGPathElement >

  // 'page' for the paper city, 'lens' for the phone's map, which draws them a touch heavier
  scale?: 'page' | 'lens'
}

// Two empty paths whose shapes the caller writes every frame, so the routes follow the moving car
const GorideRouteLayer = ({ previewRef, routeRef, scale = 'page', ...props }: GorideRouteLayerProps) => {
  // Vars
  const lens = scale === 'lens'

  return (
    <svg aria-hidden {...props}>
      <path
        ref={previewRef}
        fill='none'
        strokeWidth={lens ? 4 : 3}
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeDasharray={lens ? '1 8' : '1 9'}
        className='stroke-(--gr-ink)'
        strokeOpacity={lens ? 0.55 : 0.7}
      />
      <path
        ref={routeRef}
        fill='none'
        strokeWidth={lens ? 5 : 4}
        strokeLinecap='round'
        strokeLinejoin='round'
        className='stroke-(--gr-accent)'
      />
    </svg>
  )
}

// ---------- vehicle-icon.tsx ----------
type VehicleIconProps = {
  kind: string

  // Length of the vehicle in px; its width follows the drawing
  length: number
  className?: string
}

// Each ride type's own vehicle, drawn from above with its nose to the right and centred on its point
const VehicleIcon = ({ kind, length, className }: VehicleIconProps) => {
  // Vars
  const classes = cn('-translate-x-1/2 -translate-y-1/2', className)

  if (kind === 'xl') return <GorideSuvTop width={length * 1.1} height={length * 0.57} className={classes} />

  if (kind === 'bike') return <GorideBikeTop width={length * 0.82} height={length * 0.41} className={classes} />

  return <GorideCarTop width={length} height={length * 0.55} className={classes} />
}

// ---------- cta-button.tsx ----------
type CtaButtonProps = {
  href: string
  label: string

  // The line that rolls in on hover
  hoverLabel: string
  size?: 'md' | 'sm'
  className?: string
}

/**
 * Dark with a yellow arrow tile at its end. On hover the tile grows to fill the whole button, the text
 * turns ink and the label rolls up to its second line
 */
const CtaButton = ({ href, label, hoverLabel, size = 'md', className }: CtaButtonProps) => {
  return (
    <a href={href} className={cn('gr-cta gr-focus group', size === 'sm' && 'gr-cta-sm', className)}>
      <span aria-hidden className='gr-cta-fill' />
      {/* Both labels share one grid cell, so the button is as wide as the longer of the two */}
      <span className='gr-cta-labels relative grid overflow-hidden'>
        <span className='gr-cta-label gr-cta-label-rest'>{label}</span>
        <span aria-hidden className='gr-cta-label gr-cta-label-hover'>
          {hoverLabel}
        </span>
      </span>
      <span aria-hidden className='gr-cta-tile'>
        <ArrowUpRight className='gr-cta-arrow' strokeWidth={2.4} />
      </span>
    </a>
  )
}

// ---------- city-fleet.ts ----------
type NodeType = { i: number; j: number }

type PointType = { x: number; y: number }

type CarType = {
  // Which ride type this vehicle is: car, auto or bike
  kind: string
  from: NodeType
  to: NodeType

  // How far along from → to, 0–1; every leg is one block between two crossings
  t: number

  // Direction on screen, radians
  heading: number
  queue: NodeType[]

  // Va camino a Zplash; al llegar queda estacionado `parado` segundos, se desvanece y reaparece lejos
  rumbo?: boolean
  parado?: number
}

/**
 * The street grid, turned by CITY.angle and centred in the panel. Crossings are (i, j) in blocks;
 * everything drawn or driven goes through toWorld, so the page and the phone agree on every point
 */
const createCity = (width: number, height: number, spacing: number) => {
  const angle = (CITY.angle * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const center = { x: width / 2, y: height * CITY.centerY }
  const reach = Math.ceil(Math.hypot(width, height) / spacing / 2) + 2

  const toWorld = (i: number, j: number): PointType => ({
    x: center.x + i * spacing * cos - j * spacing * sin,
    y: center.y + i * spacing * sin + j * spacing * cos
  })

  const nearestNode = (x: number, y: number): NodeType => {
    const dx = x - center.x
    const dy = y - center.y

    return { i: Math.round((dx * cos + dy * sin) / spacing), j: Math.round((-dx * sin + dy * cos) / spacing) }
  }

  const inside = (node: NodeType, margin = spacing) => {
    const p = toWorld(node.i, node.j)

    return p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin
  }

  // The district whose name sits nearest a point
  const districtAt = (x: number, y: number) =>
    CITY.districts.reduce((best, item) =>
      Math.hypot(item.x * width - x, item.y * height - y) < Math.hypot(best.x * width - x, best.y * height - y)
        ? item
        : best
    ).name

  return { width, height, spacing, angle, center, reach, toWorld, nearestNode, inside, districtAt }
}

type CityType = ReturnType< typeof createCity >

const STEPS = [
  { i: 1, j: 0 },
  { i: -1, j: 0 },
  { i: 0, j: 1 },
  { i: 0, j: -1 }
]

const same = (a: NodeType, b: NodeType) => a.i === b.i && a.j === b.j

// Every crossing from a to b along the grid, a excluded and b included, along i first
const walk = (a: NodeType, b: NodeType) => {
  const steps: NodeType[] = []
  const cursor = { ...a }

  while (cursor.i !== b.i) {
    cursor.i += Math.sign(b.i - cursor.i)
    steps.push({ ...cursor })
  }

  while (cursor.j !== b.j) {
    cursor.j += Math.sign(b.j - cursor.j)
    steps.push({ ...cursor })
  }

  return steps
}

/**
 * Cars cruising the grid at random, one of which can be sent to a pickup. The caller steps it every
 * frame and reads positions from it; nothing here touches the page
 */
const createFleet = (city: CityType) => {
  const cars: CarType[] = []

  const state = {
    assigned: -1,

    // Where the assigned car is heading: the pickup, then the drop-off
    target: null as NodeType | null,

    // Blocks left to drive to the target, and the leg's full length, for progress bars
    left: 0,
    total: 0,
    arrived: false
  }

  const randomNode = (): NodeType => {
    for (let k = 0; k < 80; k++) {
      const node = {
        i: Math.floor(Math.random() * city.reach * 2) - city.reach,
        j: Math.floor(Math.random() * city.reach * 2) - city.reach
      }

      if (city.inside(node, -city.spacing)) return node
    }

    return { i: 0, j: 0 }
  }

  const roam = (car: CarType) => {
    const back = { i: car.from.i - car.to.i, j: car.from.j - car.to.j }

    const options = STEPS.filter(step => !(step.i === back.i && step.j === back.j))
      .map(step => ({ i: car.to.i + step.i, j: car.to.j + step.j }))
      .filter(node => city.inside(node, -city.spacing * 0.5))

    return options.length ? options[Math.floor(Math.random() * options.length)] : { ...car.from }
  }

  for (let k = 0; k < CARS.count; k++) {
    const from = randomNode()
    const step = STEPS[Math.floor(Math.random() * 4)]
    const to = { i: from.i + step.i, j: from.j + step.j }

    cars.push({ kind: RIDES[k % RIDES.length].id, from, to, t: Math.random(), heading: 0, queue: [] })
  }

  // Zplash: la esquina con Balmaceda; el terreno queda media cuadra a la izquierda, bajo Prieto Norte
  let esquina: NodeType | null = null
  let reloj = 0
  let lado = 0

  const setZplash = (node: NodeType) => {
    esquina = node
  }

  // Manda el auto libre más cercano (no las bicis) a entrar a Zplash por el lado que toca: por Prieto Norte desde
  // la izquierda o la derecha, o por Balmaceda desde arriba o abajo
  const enviar = () => {
    if (!esquina) return

    const e = esquina
    const lados = [
      { entrada: { i: e.i - 3, j: e.j }, giro: { i: e.i - 1, j: e.j } },
      { entrada: { i: e.i, j: e.j - 3 }, giro: e },
      { entrada: { i: e.i + 3, j: e.j }, giro: e },
      { entrada: { i: e.i, j: e.j + 3 }, giro: e }
    ]
    const { entrada, giro } = lados[lado++ % lados.length]

    let best = { index: -1, blocks: Infinity }

    cars.forEach((car, index) => {
      if (car.kind === 'bike' || car.rumbo || car.parado || index === state.assigned) return

      const blocks = distance(car, entrada)

      if (blocks < best.blocks) best = { index, blocks }
    })

    if (best.index < 0) return

    const car = cars[best.index]

    car.rumbo = true
    car.queue = [
      ...walk(car.to, entrada),
      ...walk(entrada, giro),
      { i: e.i - 0.5, j: e.j },
      { i: e.i - 0.5, j: e.j + 0.6 }
    ]
  }

  // Un cruce lejos de Zplash, fuera de lo que muestra el celular, donde reaparece el auto que entró
  const lejos = (): NodeType => {
    for (let k = 0; k < 40; k++) {
      const node = randomNode()

      if (!esquina || Math.abs(node.i - esquina.i) > 3 || Math.abs(node.j - esquina.j) > 4) return node
    }

    return randomNode()
  }

  const position = (car: CarType): PointType => {
    const a = city.toWorld(car.from.i, car.from.j)
    const b = city.toWorld(car.to.i, car.to.j)

    return { x: a.x + (b.x - a.x) * car.t, y: a.y + (b.y - a.y) * car.t }
  }

  // Blocks by road from a car to a crossing
  const distance = (car: CarType, node: NodeType) =>
    1 - car.t + Math.abs(node.i - car.to.i) + Math.abs(node.j - car.to.j)

  // The closest vehicle by road, of one ride type when a kind is given
  const nearest = (node: NodeType, kind?: string) => {
    let best = { index: -1, blocks: Infinity }

    cars.forEach((car, index) => {
      if (kind && car.kind !== kind) return

      const blocks = distance(car, node)

      if (blocks < best.blocks) best = { index, blocks }
    })

    return best
  }

  const countNear = (node: NodeType, blocks: number) => cars.filter(car => distance(car, node) <= blocks).length

  const dispatch = (node: NodeType, kind?: string) => {
    const { index } = nearest(node, kind)

    if (index < 0) return

    const car = cars[index]

    car.queue = walk(car.to, node)
    state.assigned = index
    state.target = node
    state.left = distance(car, node)
    state.total = state.left

    // Arrival is left to step(), which only calls it once the car is actually on the crossing
    state.arrived = false
  }

  // Sends the assigned car on from where it has stopped, for the trip to the drop-off
  const driveTo = (node: NodeType) => {
    if (state.assigned < 0) return

    const car = cars[state.assigned]

    car.queue = walk(car.from, node)
    car.to = car.queue.shift() ?? { ...car.from }
    car.t = 0
    state.target = node
    state.arrived = same(car.from, node)
    state.left = distance(car, node)
    state.total = state.left
  }

  // Puts the assigned car straight onto its target, for reduced motion where nothing drives
  const finish = () => {
    if (state.assigned < 0 || !state.target) return

    const car = cars[state.assigned]

    car.from = { ...state.target }
    car.to = { ...state.target }
    car.t = 0
    car.queue = []
    state.left = 0
    state.arrived = true
  }

  const release = () => {
    if (state.assigned >= 0) cars[state.assigned].queue = []
    state.assigned = -1
    state.target = null
    state.left = 0
    state.total = 0
    state.arrived = false
  }

  // The route still to drive, from the car to its target, as points on the page
  const route = (): PointType[] => {
    if (state.assigned < 0 || !state.target) return []

    const car = cars[state.assigned]

    return [position(car), ...[car.to, ...car.queue].map(node => city.toWorld(node.i, node.j))]
  }

  const step = (dt: number) => {
    reloj += dt

    if (reloj >= CARS.llegadaCada) {
      reloj = 0
      enviar()
    }

    cars.forEach((car, index) => {
      const assigned = index === state.assigned

      if (assigned && state.arrived) return

      // Estacionado en Zplash: espera, y al terminar reaparece lejos, andando
      if (car.parado) {
        car.parado = Math.max(0, car.parado - dt)

        if (car.parado === 0) {
          car.from = lejos()
          car.to = roam({ ...car, to: car.from, from: car.from })
          car.t = 0
        }

        return
      }

      let move = (assigned ? CARS.dispatch : car.rumbo ? CARS.llegada : CARS.cruise) * dt

      while (move > 0) {
        const remaining = 1 - car.t

        if (move < remaining) {
          car.t += move
          move = 0
        } else {
          move -= remaining
          car.from = car.to
          car.t = 0

          const next = car.queue.shift()

          if (next) {
            car.to = next
          } else if (assigned) {
            car.to = { ...car.from }
            state.arrived = true
            move = 0
          } else if (car.rumbo) {
            car.to = { ...car.from }
            car.rumbo = false
            car.parado = CARS.parado
            move = 0
          } else {
            car.to = roam(car)
          }
        }
      }

      const a = city.toWorld(car.from.i, car.from.j)
      const b = city.toWorld(car.to.i, car.to.j)

      if (!same(car.from, car.to)) {
        const target = Math.atan2(b.y - a.y, b.x - a.x)
        const turn = Math.atan2(Math.sin(target - car.heading), Math.cos(target - car.heading))

        car.heading += turn * Math.min(1, dt * 10)
      }
    })

    if (state.assigned >= 0 && state.target) {
      state.left = state.arrived ? 0 : distance(cars[state.assigned], state.target)
    }
  }

  return { cars, state, position, nearest, countNear, dispatch, driveTo, finish, release, route, step, setZplash }
}

type FleetType = ReturnType< typeof createFleet >

// ---------- phone-lens.tsx ----------
type Status = 'idle' | 'finding' | 'coming' | 'arrived' | 'trip' | 'dropped'

type TripType = { name: string; fare: number; minutes: number }

type PhoneLensProps = {
  city: CityType

  // El cruce de calles más cercano al pin, donde se escriben los nombres de las calles
  cruce: NodeType
  river: string
  parks: { i: number; j: number }[]

  // Moved every frame by the stage, so the view through the screen tracks the page underneath
  screenRef: RefObject< HTMLDivElement | null >
  mapRef: RefObject< HTMLDivElement | null >
  routeRef: RefObject< SVGPathElement | null >
  previewRef: RefObject< SVGPathElement | null >
  carRefs: RefObject< (HTMLDivElement | null)[] >

  // Live readings for the street under the pin: the wait for each ride type, in RIDES order
  district: string
  etas: number[]
  nearby: number

  // Minutes until the booked car reaches its target
  minutes: number

  // The drop-off picked on the page, if any
  trip: TripType | null

  // How far along the current leg the booked ride is, 0–1, for the trip bars
  progress: MotionValue< number >

  status: Status
  ride: number
  onRide: (index: number) => void
  onBook: () => void
}

const ICONS = { car: CarFront, xl: Car, bike: Bike }

const money = new Intl.NumberFormat(CURRENCY.locale, {
  style: 'currency',
  currency: CURRENCY.code,
  minimumFractionDigits: 2
})

const sheet = {
  initial: { opacity: 0, transform: 'translateY(10px)' },
  animate: { opacity: 1, transform: 'translateY(0px)' },
  exit: { opacity: 0, transform: 'translateY(-8px)' },
  transition: { duration: 0.3, ease: EASE_OUT }
}

const ACTIONS = [
  { label: 'Call', Icon: Phone },
  { label: 'Chat', Icon: MessageCircle },
  { label: 'Share', Icon: Share2 },
  { label: 'Safety', Icon: ShieldCheck }
]

// How far along the current leg the ride is, with its vehicle riding the bar and, for the trip, a flag
const TripBar = ({ progress, kind, flag }: { progress: MotionValue< number >; kind: string; flag?: boolean }) => {
  // Hooks
  const width = useTransform(progress, value => `${Math.min(Math.max(value, 0), 1) * 100}%`)

  return (
    <span aria-hidden className='relative mt-3 flex items-center'>
      <span className='bg-gr-accent size-2 shrink-0 rounded-full' />
      <span className='bg-gr-ink/10 relative mx-1 h-1 flex-1 rounded-full'>
        <m.span style={{ width }} className='bg-gr-accent absolute inset-y-0 left-0 rounded-full' />
        <m.span style={{ left: width }} className='absolute top-1/2'>
          <VehicleIcon kind={kind} length={18} className='block max-w-none' />
        </m.span>
      </span>
      {flag ? <Flag className='size-3 shrink-0' /> : <MapPin className='size-3 shrink-0' />}
    </span>
  )
}

// Five tappable stars after the drop-off; a fresh ride starts with none lit
const RateDriver = ({ name }: { name: string }) => {
  // States
  const [rating, setRating] = useState(0)

  return (
    <div className='gr-rate mt-auto flex w-full items-center justify-between rounded-[11px] px-3 py-2'>
      <span className='text-[11px] font-semibold'>{rating ? 'Thanks!' : `Rate ${name}`}</span>
      <span className='flex gap-0.5'>
        {Array.from({ length: 5 }, (_, index) => (
          <button
            key={index}
            type='button'
            aria-label={`${index + 1} star${index ? 's' : ''}`}
            onClick={() => setRating(index + 1)}
            className='gr-focus cursor-pointer rounded-[4px] p-0.5'
 >
            <Star
              aria-hidden
              className={cn(
                'size-4 transition-colors',
                index < rating ? 'fill-gr-accent text-gr-accent' : 'text-gr-ink/25'
              )}
            />
          </button>
        ))}
      </span>
    </div>
  )
}

// The sheet takes clicks without starting a drag of the whole phone
const holdStill = (event: ReactPointerEvent) => event.stopPropagation()

/**
 * Press and hold to book: the button fills with yellow from the left while a car drives along the
 * fill's edge. Letting go early rolls it back; Enter or Space books at once
 */
type HoldProps = { label: string; kind: string; busy: boolean; onBook: () => void }

const HoldToBook = ({ label, kind, busy, onBook }: HoldProps) => {
  // Refs
  const runRef = useRef< { stop: () => void } | null >(null)

  // Hooks
  const fill = useMotionValue(0)
  const width = useTransform(fill, value => `${value * 100}%`)
  const reveal = useTransform(fill, value => `inset(0 ${100 - value * 100}% 0 0)`)
  const shown = useTransform(fill, [0, 0.06], [0, 1])

  const handleStart = (event: ReactPointerEvent< HTMLButtonElement >) => {
    if (busy || event.button !== 0) return

    runRef.current?.stop()
    runRef.current = animate(fill, 1, {
      duration: BOOKING.press * (1 - fill.get()),
      ease: 'linear',
      onComplete: () => {
        onBook()
        fill.set(0)
      }
    })
  }

  const handleStop = () => {
    if (fill.get() >= 1) return

    runRef.current?.stop()
    runRef.current = animate(fill, 0, { duration: 0.25, ease: EASE_OUT })
  }

  const handleKey = (event: ReactKeyboardEvent< HTMLButtonElement >) => {
    if (busy || (event.key !== 'Enter' && event.key !== ' ')) return

    event.preventDefault()
    onBook()
  }

  return (
    <button
      type='button'
      disabled={busy}
      onPointerDown={handleStart}
      onPointerUp={handleStop}
      onPointerLeave={handleStop}
      onPointerCancel={handleStop}
      onKeyDown={handleKey}
      aria-label={busy ? label : `${label}. Press and hold, or press Enter`}
      className='gr-hold gr-focus relative mt-3 flex h-10 w-full cursor-pointer items-center justify-center overflow-hidden rounded-[11px] text-[13px] font-semibold select-none disabled:cursor-progress'
 >
      <m.span aria-hidden style={{ scaleX: fill }} className='bg-gr-accent absolute inset-0 origin-left' />
      <span className='relative flex items-center gap-2 text-white'>
        {busy && <LoaderCircle aria-hidden className='size-4 animate-spin' />}
        {label}
      </span>
      <m.span
        aria-hidden
        style={{ clipPath: reveal }}
        className='text-gr-ink absolute inset-0 flex items-center justify-center gap-2'
 >
        {busy && <LoaderCircle className='size-4 animate-spin' />}
        {label}
      </m.span>
      <m.span aria-hidden style={{ left: width, opacity: shown }} className='absolute top-1/2'>
        <VehicleIcon kind={kind} length={22} />
      </m.span>
    </button>
  )
}

/**
 * The GoRide app on a phone that works as a window onto the city: its screen shows the street under
 * it in the app's own colours, larger, with the real cars on it. The pin sits where a rider would
 * drop it; the sheet below books from there and follows the ride to the drop-off
 */
const PhoneLens = ({
  city,
  cruce,
  river,
  parks,
  screenRef,
  mapRef,
  routeRef,
  previewRef,
  carRefs,
  district,
  etas,
  nearby,
  minutes,
  trip,
  progress,
  status,
  ride,
  onRide,
  onBook
}: PhoneLensProps) => {
  const { BRAND, DRIVER, PAYMENT, CUENTA } = useGoride()
  const restantes = Math.max(CUENTA.total - CUENTA.usados, 0)

  // Hooks

  // The app's map only changes with the city, so it is not redrawn on every reading
  const plan = useMemo(
    () => (
      <GorideCityPlan
        variant='app'
        width={city.width}
        height={city.height}
        spacing={city.spacing}
        angle={CITY.angle}
        center={city.center}
        reach={city.reach}
        avenueEvery={CITY.avenueEvery}
        river={river}
        parks={parks}
        labels={CITY.districts.map(item => ({ name: item.name, x: item.x * city.width, y: item.y * city.height }))}
      />
    ),
    [city, river, parks]
  )

  // Nombres de las dos calles que se cruzan bajo el pin, a lo largo de cada una, como en un mapa
  const calles = useMemo(() => {
    const [sube, cruza] = CUENTA.calles
    const size = city.spacing * 0.14
    const a = city.toWorld(cruce.i, cruce.j + 1.15)
    const b = city.toWorld(cruce.i - 1.55, cruce.j)

    return (
      <svg width={city.width} height={city.height} className='absolute top-0 left-0' aria-hidden>
        {[
          { name: sube, p: a, rot: CITY.angle - 90 },
          { name: cruza, p: b, rot: CITY.angle }
        ].map(({ name, p, rot }) => (
          <text
            key={name}
            x={p.x}
            y={p.y}
            transform={`rotate(${rot} ${p.x} ${p.y})`}
            textAnchor='middle'
            dominantBaseline='central'
            fontSize={size}
            fontWeight='700'
            letterSpacing='0.06em'
            className='fill-(--gr-ink)'
            fillOpacity='0.55'
          >
            {name.toUpperCase()}
          </text>
        ))}
      </svg>
    )
  }, [city, cruce.i, cruce.j, CUENTA.calles])

  // Vars
  const planning = status === 'idle' || status === 'finding'
  const riding = status === 'trip' || status === 'dropped'
  const firstName = DRIVER.name.split(' ')[0]

  const fareFor = (index: number) => (trip ? money.format(trip.fare * RIDES[index].price) : null)

  const eta = etas[ride] ?? 1
  const pinChip = CUENTA.pin

  return (
    <div className='gr-phone relative'>
      <div className='gr-bezel'>
        <div ref={screenRef} className='gr-screen relative overflow-hidden'>
          <div className='absolute inset-0'>
            {/* The city in the app's colours, moved and scaled by the stage so it lines up with the page */}
            <div ref={mapRef} className='absolute top-0 left-0 origin-top-left will-change-transform'>
              {plan}
              {calles}
            </div>

            <GorideRouteLayer
              previewRef={previewRef}
              routeRef={routeRef}
              scale='lens'
              className='absolute inset-0 size-full overflow-visible'
            />

            {Array.from({ length: CARS.count }, (_, index) => (
              <div
                key={index}
                ref={el => {
                  carRefs.current[index] = el
                }}
                className='absolute top-0 left-0 will-change-transform'
 >
                <VehicleIcon kind={RIDES[index % RIDES.length].id} length={24} className='gr-lens-car' />
              </div>
            ))}

            {/* The pickup pin, with the wait for the chosen ride above it */}
            {!riding && (
              <div className='absolute left-1/2' style={{ top: `${LENS.pinY * 100}%` }}>
                <span className='gr-pin-shadow absolute top-0 left-0 h-[6px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full' />
                <div className='absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center'>
                  <span className='bg-gr-ink mb-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-white'>
                    {pinChip}
                  </span>
                  <span className='bg-gr-accent border-gr-ink grid size-[18px] place-items-center rounded-full border-[2.5px]'>
                    <span className='bg-gr-ink size-[5px] rounded-full' />
                  </span>
                  <span className='bg-gr-ink h-[10px] w-[2px] rounded-full' />
                </div>
              </div>
            )}
          </div>

          {/* The app's header fades the map out behind the status bar and search, as in the app */}
          <span aria-hidden className='gr-screen-top pointer-events-none absolute inset-x-0 top-0 z-10 h-[150px]' />

          <div className='text-gr-ink pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[11px] text-[11px] font-semibold'>
            <span>9:41</span>
            <span className='flex items-center gap-1'>
              <Signal aria-hidden className='size-3' />
              <Wifi aria-hidden className='size-3' />
              <BatteryFull aria-hidden className='size-3.5' />
            </span>
          </div>
          <span className='absolute top-[8px] left-1/2 z-10 h-[20px] w-[72px] -translate-x-1/2 rounded-full bg-black' />

          <div className='absolute inset-x-3 top-[38px] z-10'>
            <div className='flex items-center justify-between px-1'>
              {/* Zplash: logo oficial (letras oscuras, para fondo claro) */}
              <img src='/logo-oscuro.png' alt={BRAND.name} width={606} height={151} className='h-[16px] w-auto' />

              <span className='gr-avatar grid size-6 place-items-center rounded-full text-[9px] font-bold'>Tú</span>
            </div>
            <div className='gr-search mt-2 rounded-[12px] px-3 py-2'>
              <span className='flex items-center gap-2'>
                <MapPin aria-hidden className='size-3.5 shrink-0' />
                <span className='min-w-0'>
                  <span className='text-gr-grey block text-[9.5px] leading-tight'>{CUENTA.lugarRotulo}</span>
                  <span className='block truncate text-[12.5px] leading-tight font-semibold'>{CUENTA.lugar}</span>
                </span>
              </span>
              <span className='border-gr-line mt-1.5 flex items-center gap-2 border-t pt-1.5'>
                <Clock aria-hidden className='size-3.5 shrink-0' />
                <span className='text-gr-grey truncate text-[11.5px]'>{CUENTA.horario}</span>
              </span>
            </div>
          </div>

          {/* The sheet: choose and book, then the driver on their way, then the trip */}
          <div
            onPointerDown={holdStill}
            className='gr-sheet absolute inset-x-0 bottom-0 z-10 flex min-h-[33%] flex-col rounded-t-[22px] px-3.5 pt-2 pb-3'
 >
            <span className='bg-gr-ink/15 mx-auto mb-2 block h-1 w-8 shrink-0 rounded-full' />

            <AnimatePresence mode='wait' initial={false}>
              {planning && (
                <m.div key='plan' {...sheet} className='flex min-h-0 flex-1 flex-col'>
                  {/* Zplash: la cuenta de la patente en vez de elegir y pedir un viaje */}
                  <div className='flex items-center justify-between gap-2'>
                    <Patente patente={CUENTA.patente} />
                    <span style={{ backgroundColor: 'color-mix(in oklab, var(--gr-accent) 30%, transparent)' }} className='rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap'>
                      {CUENTA.plan}
                    </span>
                  </div>
                  <p className='mt-3 text-[17px] leading-none font-semibold tracking-[-0.02em]'>
                    Te quedan {restantes} lavados de {CUENTA.total}
                  </p>
                  <div aria-hidden className='mt-2.5 flex gap-1'>
                    {Array.from({ length: CUENTA.total }, (_, index) => (
                      <span
                        key={index}
                        style={index < CUENTA.usados ? { backgroundColor: 'color-mix(in oklab, var(--gr-ink) 22%, transparent)' } : undefined}
                        className={cn('h-1.5 flex-1 rounded-full', index < CUENTA.usados ? '' : 'bg-gr-accent')}
                      />
                    ))}
                  </div>
                  <p className='text-gr-grey mt-2 text-[10.5px]'>{CUENTA.nota}</p>
                  <a
                    href={CUENTA.cta.href}
                    className='gr-hold gr-focus mt-auto flex h-10 w-full items-center justify-center gap-1.5 rounded-[11px] text-[13px] font-semibold text-white'
 >
                    {CUENTA.cta.label}
                    <ChevronRight aria-hidden className='size-4' />
                  </a>
                </m.div>
              )}

              {(status === 'coming' || status === 'arrived') && (
                <m.div key='driver' {...sheet} className='flex min-h-0 flex-1 flex-col'>
                  <div className='flex items-center gap-2.5'>
                    <span className='gr-avatar grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-bold'>
                      {DRIVER.initials}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-[12.5px] font-semibold'>{DRIVER.name}</span>
                      <span className='text-gr-grey flex items-center gap-1 text-[10px] whitespace-nowrap'>
                        <Star aria-hidden className='fill-gr-accent text-gr-accent size-3' />
                        {DRIVER.rating} · {DRIVER.trips}
                      </span>
                    </span>
                    <span className='text-right leading-tight'>
                      <span className='gr-plate block rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.04em]'>
                        {DRIVER.plate}
                      </span>
                      <span className='text-gr-grey mt-0.5 block text-[9.5px]'>{RIDES[ride].vehicle}</span>
                    </span>
                  </div>

                  <div className='mt-2.5 flex items-end justify-between'>
                    <p className='text-[17px] leading-none font-semibold tracking-[-0.02em]'>
                      {status === 'arrived' ? 'Your ride is here' : `Arriving in ${minutes} min`}
                    </p>
                    <span className='gr-pin-code rounded-[7px] px-2 py-1 text-[10px] font-semibold'>
                      PIN <b className='tracking-[0.12em]'>{DRIVER.pin}</b>
                    </span>
                  </div>

                  <TripBar progress={progress} kind={RIDES[ride].id} />

                  <div className='mt-auto grid grid-cols-4 gap-1.5'>
                    {ACTIONS.map(action => (
                      <span
                        key={action.label}
                        className='gr-action flex flex-col items-center gap-0.5 rounded-[10px] py-1.5'
 >
                        <action.Icon
                          aria-hidden
                          className={cn('size-3.5', action.label === 'Safety' && 'text-[#D9483B]')}
                        />
                        <span className='text-[9.5px] font-medium'>{action.label}</span>
                      </span>
                    ))}
                  </div>
                </m.div>
              )}

              {status === 'trip' && (
                <m.div key='trip' {...sheet} className='flex min-h-0 flex-1 flex-col'>
                  <span className='text-gr-grey flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.06em] uppercase'>
                    <Navigation aria-hidden className='text-gr-ink size-3' />
                    On your trip
                  </span>
                  <p className='mt-1.5 text-[17px] leading-none font-semibold tracking-[-0.02em]'>
                    {minutes} min to {trip?.name}
                  </p>

                  <TripBar progress={progress} kind={RIDES[ride].id} flag />
                  <div className='text-gr-grey mt-1 flex justify-between text-[9.5px]'>
                    <span>{district}</span>
                    <span>{trip?.name}</span>
                  </div>

                  <div className='border-gr-line mt-2 flex items-center gap-2 border-t pt-2 text-[11px]'>
                    <span className='gr-pay-mark flex h-5 shrink-0 items-center gap-px rounded-[5px] px-1.5 text-[9px] font-semibold'>
                      <GorideAppleIcon className='size-2.5' />
                      Pay
                    </span>
                    <span className='min-w-0 flex-1 truncate font-semibold'>{fareFor(ride)}</span>
                    <span className='text-gr-grey'>
                      {firstName} · {RIDES[ride].vehicle}
                    </span>
                  </div>

                  <div className='mt-auto grid grid-cols-2 gap-1.5'>
                    {ACTIONS.slice(2).map(action => (
                      <span
                        key={action.label}
                        className='gr-action flex items-center justify-center gap-1.5 rounded-[10px] py-2'
 >
                        <action.Icon
                          aria-hidden
                          className={cn('size-3.5', action.label === 'Safety' && 'text-[#D9483B]')}
                        />
                        <span className='text-[10.5px] font-semibold'>
                          {action.label === 'Share' ? 'Share trip' : 'Safety'}
                        </span>
                      </span>
                    ))}
                  </div>
                </m.div>
              )}

              {status === 'dropped' && (
                <m.div key='dropped' {...sheet} className='flex min-h-0 flex-1 flex-col items-center text-center'>
                  <m.span
                    initial={{ transform: 'scale(0.5)' }}
                    animate={{ transform: 'scale(1)' }}
                    transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                    className='bg-gr-accent grid size-9 place-items-center rounded-full'
 >
                    <Check aria-hidden className='size-4.5' strokeWidth={3} />
                  </m.span>
                  <p className='mt-2 text-[16px] leading-tight font-semibold tracking-[-0.02em]'>
                    Welcome to {trip?.name}
                  </p>
                  <p className='text-gr-grey mt-0.5 text-[10.5px]'>
                    Paid {fareFor(ride)} with {PAYMENT.method} · thanks for riding
                  </p>
                  <RateDriver name={firstName} />
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- city-stage.tsx ----------
type CityStageProps = {
  reduceMotion: boolean

  // When the entrances begin: after the splash, or at once where there is none, seconds
  start: number
}

type ReadingType = { district: string; etas: number[]; nearby: number; minutes: number; blocks: number; cruce: NodeType }

// The river runs from the bottom middle up to the top right, as fractions of the panel
const riverPath = (width: number, height: number) =>
  `M ${width * 0.36} ${height * 1.04} C ${width * 0.5} ${height * 0.74}, ${width * 0.6} ${height * 0.66}, ${width * 0.74} ${height * 0.5} S ${width * 0.93} ${height * 0.12}, ${width * 1.04} ${height * 0.02}`

const pathFrom = (points: PointType[]) =>
  points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')

/**
 * The page is the city: a paper map with its districts written large. The phone is a window onto it:
 * its screen shows the street underneath, larger and in the app's colours, with the
 * live cars. Tapping the page sets a drop-off; holding Book brings the nearest car to the pin, then the
 * phone stays put while the car drives out of its screen and across the page to the drop-off
 */
const CityStage = ({ reduceMotion, start }: CityStageProps) => {
  const { FONDO } = useGoride()
  // States
  const [city, setCity] = useState< CityType | null >(null)
  const [status, setStatus] = useState< Status >('idle')
  const [ride, setRide] = useState(0)
  const [dropoff, setDropoff] = useState< NodeType | null >(null)
  const [hover, setHover] = useState< string | null >(null)

  const [reading, setReading] = useState< ReadingType >({
    district: CITY.districts[2].name,
    etas: RIDES.map(() => 2),
    nearby: 3,
    minutes: 0,
    blocks: 0,
    cruce: { i: 0, j: 0 }
  })

  // Refs
  const stageRef = useRef< HTMLDivElement >(null)
  const phoneRef = useRef< HTMLDivElement >(null)
  const screenRef = useRef< HTMLDivElement >(null)
  const mapRef = useRef< HTMLDivElement >(null)
  const routeRef = useRef< SVGPathElement >(null)
  const previewRef = useRef< SVGPathElement >(null)
  const pageRouteRef = useRef< SVGPathElement >(null)
  const pagePreviewRef = useRef< SVGPathElement >(null)
  const pageCarRef = useRef< HTMLDivElement >(null)
  const cursorRef = useRef< HTMLDivElement >(null)
  const carRefs = useRef< (HTMLDivElement | null)[] >([])
  const fleetRef = useRef< FleetType | null >(null)
  const statusRef = useRef< Status >('idle')
  const dropoffRef = useRef< NodeType | null >(null)
  const timersRef = useRef< ReturnType< typeof setTimeout >[] >([])

  // Hooks
  const progress = useMotionValue(0)

  // Kept stable per city, so the large map drawings are only rebuilt when the city is
  const river = useMemo(() => (city ? riverPath(city.width, city.height) : ''), [city])

  const parks = useMemo(
    () => (city ? CITY.parks.map(park => city.nearestNode(park.x * city.width, park.y * city.height)) : []),
    [city]
  )

  const plan = useMemo(
    () =>
      city ? (
        <GorideCityPlan
          variant='ink'
          width={city.width}
          height={city.height}
          spacing={city.spacing}
          angle={CITY.angle}
          center={city.center}
          reach={city.reach}
          avenueEvery={CITY.avenueEvery}
          river={river}
          parks={parks}
          roads={CITY.roads}
          className='absolute inset-0'
        />
      ) : null,
    [city, river, parks]
  )

  // Vars
  const dropPoint = city && dropoff ? city.toWorld(dropoff.i, dropoff.j) : null
  const dropName = city && dropPoint ? city.districtAt(dropPoint.x, dropPoint.y) : ''
  const showCar = status === 'coming' || status === 'arrived' || status === 'trip' || status === 'dropped'

  const trip: TripType | null = dropoff
    ? {
        name: dropName,
        fare: FARE.base + reading.blocks * FARE.perBlock,
        minutes: Math.max(1, Math.ceil(reading.blocks * FARE.minutesPerBlock))
      }
    : null

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    dropoffRef.current = dropoff
  }, [dropoff])

  // A new panel size redraws the city and puts the cars back on its streets
  useEffect(() => {
    const stage = stageRef.current

    if (!stage) return

    let size = { width: 0, height: 0 }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect

      // A mobile URL bar showing or hiding only nudges the height; a ride in progress carries on through it
      if (width === size.width && Math.abs(height - size.height) < 140 && statusRef.current !== 'idle') return

      size = { width, height }

      const spacing = width >= 1800 ? CITY.spacingLarge : width >= 1024 ? CITY.spacing : CITY.spacingSmall
      const next = createCity(width, height, spacing)

      // A new city means new cars, so anything waiting on the old fleet is dropped with it
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
      fleetRef.current = createFleet(next)
      setCity(next)
      setStatus('idle')
      setDropoff(null)
    })

    observer.observe(stage)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const timers = timersRef.current

    return () => timers.forEach(clearTimeout)
  }, [])

  // One loop drives everything that moves: the cars in the phone, the view, the routes and the readings.
  // It runs while the stage is on screen and the tab is visible, and carries on from where it stopped
  useEffect(() => {
    const stage = stageRef.current

    if (!city || !stage) return

    let frame = 0
    let onScreen = true
    let last = performance.now()
    let lastReading = ''

    // The phone and its screen only move when the layout does, so they are measured then, never inside the frame
    // loop: reading offsets after the previous frame's writes would force a layout on every frame
    const box = { width: 0, height: 0, left: 0, top: 0 }

    const measure = () => {
      const phone = phoneRef.current
      const screen = screenRef.current

      if (!phone || !screen) return

      box.width = screen.offsetWidth
      box.height = screen.offsetHeight
      box.left = phone.offsetLeft + screen.offsetLeft
      box.top = phone.offsetTop + screen.offsetTop
    }

    measure()

    const section = stage.parentElement
    const layoutObserver = new ResizeObserver(measure)
    const styleObserver = new MutationObserver(measure)

    layoutObserver.observe(stage)
    if (phoneRef.current) layoutObserver.observe(phoneRef.current)
    if (screenRef.current) layoutObserver.observe(screenRef.current)

    // The section writes the copy's bottom edge to its style, which moves the phone on small screens
    if (section) styleObserver.observe(section, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', measure)
    document.fonts?.ready.then(measure)

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      const fleet = fleetRef.current

      last = now

      if (fleet && box.width) {
        // Under reduced motion nothing drives: a booked ride simply appears where it is going
        if (!reduceMotion) fleet.step(dt)
        else if (fleet.state.assigned >= 0 && !fleet.state.arrived) fleet.finish()

        const pin = { x: box.width / 2, y: box.height * LENS.pinY }
        const assigned = fleet.state.assigned >= 0 ? fleet.position(fleet.cars[fleet.state.assigned]) : null

        // Mapa real girado 90° a la derecha: el pin queda en el terreno bajo Prieto Norte (horizontal), media cuadra a la izquierda de la esquina (Prieto Norte 71,
        // media cuadra al sur de Av. Balmaceda); la vista se corre a lo más media cuadra respecto de la página
        const raw = { x: box.left + pin.x - city.center.x, y: box.top + pin.y - city.center.y }
        const gi = (raw.x * Math.cos(city.angle) + raw.y * Math.sin(city.angle)) / city.spacing
        const gj = (-raw.x * Math.sin(city.angle) + raw.y * Math.cos(city.angle)) / city.spacing
        const esquina = { i: Math.ceil(gi), j: Math.round(gj) }
        const focus = city.toWorld(esquina.i - 0.5, esquina.j + 0.3)

        fleet.setZplash(esquina)

        const toScreen = (point: PointType) => ({
          x: (point.x - focus.x) * LENS.zoom + pin.x,
          y: (point.y - focus.y) * LENS.zoom + pin.y
        })

        if (mapRef.current) {
          mapRef.current.style.transform = `translate(${pin.x - focus.x * LENS.zoom}px, ${pin.y - focus.y * LENS.zoom}px) scale(${LENS.zoom})`
        }

        fleet.cars.forEach((car, index) => {
          const seen = toScreen(fleet.position(car))
          const icon = carRefs.current[index]

          if (icon) {
            icon.style.transform = `translate(${seen.x}px, ${seen.y}px) rotate(${car.heading}rad)`
            // El auto que llegó a Zplash se desvanece en su último medio segundo estacionado
            icon.style.opacity = car.parado ? String(Math.min(1, car.parado / 0.5)) : '1'
          }
        })

        // Only your own car is shown on the page; everyone else's is for the app to show
        if (pageCarRef.current && assigned) {
          const car = fleet.cars[fleet.state.assigned]

          pageCarRef.current.style.transform = `translate(${assigned.x}px, ${assigned.y}px) rotate(${car.heading}rad)`
        }

        const route = fleet.route()

        progress.set(fleet.state.total > 0 ? 1 - fleet.state.left / fleet.state.total : 0)

        routeRef.current?.setAttribute('d', route.length > 1 ? pathFrom(route.map(toScreen)) : '')
        pageRouteRef.current?.setAttribute('d', route.length > 1 ? pathFrom(route) : '')

        const node = city.nearestNode(focus.x, focus.y)
        const drop = dropoffRef.current
        const planning = statusRef.current === 'idle' || statusRef.current === 'finding'

        // Before booking, a dotted line shows the trip from the pin to the drop-off
        const preview = drop && planning ? [node, ...walk(node, drop)].map(step => city.toWorld(step.i, step.j)) : []

        previewRef.current?.setAttribute('d', preview.length > 1 ? pathFrom(preview.map(toScreen)) : '')
        pagePreviewRef.current?.setAttribute('d', preview.length > 1 ? pathFrom(preview) : '')

        const next: ReadingType = {
          district: city.districtAt(focus.x, focus.y),
          etas: RIDES.map(item => Math.max(1, Math.ceil(fleet.nearest(node, item.id).blocks * CARS.minutesPerBlock))),
          nearby: fleet.countNear(node, CARS.nearby),
          minutes: Math.max(1, Math.ceil(fleet.state.left * CARS.minutesPerBlock)),
          blocks: drop ? Math.abs(drop.i - node.i) + Math.abs(drop.j - node.j) : 0,
          cruce: esquina
        }

        const key = `${esquina.i},${esquina.j}|${next.district}|${next.etas.join(',')}|${next.nearby}|${next.minutes}|${next.blocks}`

        if (key !== lastReading) {
          lastReading = key

          // The trip's length is fixed once booked; only the pickup readings move with the phone before that
          setReading(previous => (planning ? next : { ...next, blocks: previous.blocks }))
        }

        if (fleet.state.arrived && statusRef.current === 'coming') {
          statusRef.current = 'arrived'
          setStatus('arrived')
        }

        if (fleet.state.arrived && statusRef.current === 'trip') {
          statusRef.current = 'dropped'
          setStatus('dropped')
        }
      }

      frame = requestAnimationFrame(loop)
    }

    const sync = () => {
      const run = onScreen && !document.hidden

      if (run && !frame) {
        last = performance.now()
        frame = requestAnimationFrame(loop)
      } else if (!run && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      sync()
    })

    frame = requestAnimationFrame(loop)
    observer.observe(stage)
    document.addEventListener('visibilitychange', sync)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      layoutObserver.disconnect()
      styleObserver.disconnect()
      window.removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [city, progress, reduceMotion])

  // After pickup the trip starts on its own; after the drop-off, or a pickup with nowhere set, it all resets
  useEffect(() => {
    if (status !== 'arrived' && status !== 'dropped') return

    const timer = setTimeout(
      () => {
        const fleet = fleetRef.current

        if (status === 'arrived' && dropoffRef.current && fleet) {
          fleet.driveTo(dropoffRef.current)
          setStatus('trip')

          return
        }

        fleet?.release()
        setStatus('idle')
        setDropoff(null)
      },
      (status === 'arrived' ? BOOKING.pickup : BOOKING.hold) * 1000
    )

    return () => clearTimeout(timer)
  }, [status])

  const handleBook = () => {
    const fleet = fleetRef.current
    const phone = phoneRef.current
    const screen = screenRef.current

    if (!fleet || !phone || !screen || !city) return

    setStatus('finding')

    const focusX = phone.offsetLeft + screen.offsetLeft + screen.offsetWidth / 2
    const focusY = phone.offsetTop + screen.offsetTop + screen.offsetHeight * LENS.pinY
    const pickup = city.nearestNode(focusX, focusY)

    timersRef.current.push(
      setTimeout(() => {
        // The city may have been rebuilt in the meantime, taking this fleet with it
        if (fleetRef.current !== fleet) return

        fleet.dispatch(pickup, RIDES[ride].id)
        setStatus('coming')
      }, BOOKING.search * 1000)
    )
  }

  const onPhone = (target: EventTarget | null) => target instanceof Element && !!target.closest('.gr-phone-spot')

  // The copy column is for reading: no drop-offs and no tag within a margin around it
  const onCopy = (stage: HTMLElement, clientX: number, clientY: number) => {
    const copy = stage.parentElement?.querySelector('.gr-copy')?.getBoundingClientRect()
    const margin = 32

    return (
      !!copy &&
      clientX > copy.left - margin &&
      clientX < copy.right + margin &&
      clientY > copy.top - margin &&
      clientY < copy.bottom + margin
    )
  }

  // Tapping the paper city sets the drop-off at the nearest crossing
  const handleTap = (event: ReactMouseEvent< HTMLDivElement >) => {
    if (!city || onPhone(event.target) || status !== 'idle') return
    if (onCopy(event.currentTarget, event.clientX, event.clientY)) return

    const box = event.currentTarget.getBoundingClientRect()

    setDropoff(city.nearestNode(event.clientX - box.left, event.clientY - box.top))
  }

  // Over the paper, a small tag follows the pointer and names the place a tap would go to
  const handlePointer = (event: ReactPointerEvent< HTMLDivElement >) => {
    const tag = cursorRef.current

    if (!city || !tag) return

    const free =
      event.pointerType === 'mouse' &&
      !onPhone(event.target) &&
      status === 'idle' &&
      !onCopy(event.currentTarget, event.clientX, event.clientY)

    const box = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - box.left
    const py = event.clientY - box.top

    tag.style.transform = `translate(${px}px, ${py}px)`
    tag.style.opacity = free ? '1' : '0'
    event.currentTarget.style.cursor = free ? 'crosshair' : ''

    const name = free ? city.districtAt(px, py) : null

    if (name !== hover) setHover(name)
  }

  const handleLeave = () => {
    if (cursorRef.current) cursorRef.current.style.opacity = '0'
    setHover(null)
  }

  return (
    // Zplash: sin clic ni puntero sobre el mapa (marcaba un destino con tarifa, propio de una app de viajes)
    <div ref={stageRef} className='absolute inset-0'>
      {FONDO && (
        <div aria-hidden className='gr-fondo pointer-events-none absolute inset-0 z-[15]'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FONDO} alt='' fetchPriority='high' className='size-full object-cover' />
        </div>
      )}
      {city && (
        <>
          {/* The city draws itself outward from the phone, after the screen has come on */}
          <m.div
            key={start}
            aria-hidden
            initial={{ '--gr-reveal': reduceMotion ? '170%' : '0%' }}
            animate={{ '--gr-reveal': '170%' }}
            transition={{ duration: reduceMotion ? 0 : 1.8, delay: reduceMotion ? 0 : start, ease: EASE_OUT }}
            className='gr-reveal pointer-events-none absolute inset-0'
 >
            <div className='gr-plan absolute inset-0'>
              {plan}

              {CITY.districts.map(item => (
                <span
                  key={item.name}
                  style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                  className={cn(
                    'gr-district font-gr-display absolute -translate-x-1/2 -translate-y-1/2 font-semibold whitespace-nowrap',
                    item.name === reading.district && 'gr-district-on',
                    item.name === hover && item.name !== reading.district && 'gr-district-hover'
                  )}
 >
                  {item.name}
                </span>
              ))}

              <GorideRouteLayer
                previewRef={pagePreviewRef}
                routeRef={pageRouteRef}
                className='absolute inset-0 size-full overflow-visible'
              />
            </div>
          </m.div>

          {/* The drop-off flag, with the trip's fare and time */}
          <AnimatePresence>
            {dropPoint && trip && (
              <m.div
                key={`${dropoff?.i}:${dropoff?.j}`}
                initial={{ opacity: 0, transform: 'translateY(-16px) scale(0.8)' }}
                animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
                exit={{ opacity: 0, transform: 'translateY(0px) scale(0.8)' }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                style={{ left: dropPoint.x, top: dropPoint.y }}
                className='pointer-events-none absolute z-10'
 >
                <span className='gr-flag absolute bottom-[18px] left-0 flex -translate-x-1/2 items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-[12.5px] font-semibold whitespace-nowrap'>
                  <span className='bg-gr-ink grid size-6 place-items-center rounded-full text-white'>
                    <Flag aria-hidden className='size-3' />
                  </span>
                  {trip.name}
                  <span className='text-gr-grey font-medium'>
                    {money.format(trip.fare * RIDES[ride].price)} · {trip.minutes} min
                  </span>
                </span>
                <span className='gr-flag-stem absolute bottom-0 left-0 h-[18px] w-[2px] -translate-x-1/2' />
                <span className='bg-gr-ink absolute top-0 left-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full' />
              </m.div>
            )}
          </AnimatePresence>

          {/* Your car, the only one the page shows, once it is on its way */}
          <div
            ref={pageCarRef}
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-0 left-0 z-10 transition-opacity duration-300 will-change-transform',
              showCar ? 'opacity-100' : 'opacity-0'
            )}
 >
            <VehicleIcon kind={RIDES[ride].id} length={26} className='gr-lens-car' />
          </div>

          {/* The phone stays where it is; the drop-in runs on an inner wrapper so it never moves the view */}
          <div ref={phoneRef} className='gr-phone-spot absolute z-20'>
            <span aria-hidden className='gr-phone-glow pointer-events-none absolute' />
            <m.div
              initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(-70px) rotate(-5deg)' }}
              animate={{ opacity: 1, transform: 'translateY(0px) rotate(0deg)' }}
              transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.15 }}
              className='relative'
 >
              <PhoneLens
                city={city}
                river={river}
                parks={parks}
                screenRef={screenRef}
                mapRef={mapRef}
                routeRef={routeRef}
                previewRef={previewRef}
                carRefs={carRefs}
                district={reading.district}
                cruce={reading.cruce}
                etas={reading.etas}
                nearby={reading.nearby}
                minutes={reading.minutes}
                trip={trip}
                progress={progress}
                status={status}
                ride={ride}
                onRide={setRide}
                onBook={handleBook}
              />
            </m.div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- hero-copy.tsx ----------
/**
 * Starts at 1% rather than 0, so the text is painted (under the splash) on first load and counts for
 * LCP then, instead of only once the splash has gone. At 1% it still reads as hidden
 */
const HIDDEN = { opacity: 0.01, transform: 'translateY(16px)' }

// Held at its start until the timing is known, so the same elements play on without being remounted.
// Sin pantalla de carga (landing de Zplash) no hay entrada: el texto sale visible desde el HTML del
// servidor, así no espera a que cargue el JS (LCP en celulares lentos)
const rise = (delay: number, ready: boolean, entrada = true) => ({
  initial: entrada ? HIDDEN : (false as const),
  animate: ready ? { opacity: 1, transform: 'translateY(0px)' } : HIDDEN,
  transition: { duration: 0.7, delay, ease: EASE_OUT }
})

const count = new Intl.NumberFormat('en-US')

const subscribeNever = () => () => {}

/**
 * Calls `run` every `every` ms, the first time after `first` ms, counting only while `target` is on
 * screen and the tab is visible. Returns the cleanup
 */
const repeatWhileShown = (target: Element, every: number, first: number, run: () => void) => {
  let timer: ReturnType< typeof setTimeout > | undefined
  let onScreen = true
  let due = first
  let since = 0

  const schedule = () => {
    since = performance.now()
    timer = setTimeout(() => {
      run()
      due = every
      schedule()
    }, due)
  }

  const sync = () => {
    const go = onScreen && !document.hidden

    if (go && timer === undefined) {
      schedule()
    } else if (!go && timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
      due = Math.max(0, due - (performance.now() - since))
    }
  }

  const observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    sync()
  })

  schedule()
  observer.observe(target)
  document.addEventListener('visibilitychange', sync)

  return () => {
    clearTimeout(timer)
    observer.disconnect()
    document.removeEventListener('visibilitychange', sync)
  }
}

/**
 * One phrase, word by word: each word rises a little out of a soft blur into place, and on the way
 * out drifts up and blurs away, so the line changes like a slow cross-dissolve rather than a flip
 */
const Phrase = ({ text }: { text: string }) => {
  return (
    <span className='gr-phrase inline-flex flex-wrap gap-x-[0.26em]'>
      {text.split(' ').map((word, index) => (
        <m.span
          key={`${word}-${index}`}
          initial={{ opacity: 0, transform: 'translateY(0.35em)', filter: 'blur(10px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)' }}
          exit={{
            opacity: 0,
            transform: 'translateY(-0.3em)',
            filter: 'blur(10px)',
            transition: { duration: 0.4, delay: index * 0.05, ease: [0.4, 0, 1, 1] }
          }}
          transition={{ duration: 0.75, delay: 0.15 + index * 0.09, ease: EASE_OUT }}
          className='inline-block'
 >
          {word}
        </m.span>
      ))}
    </span>
  )
}

// Counts from the last figure to the new one, so the live number reads as moving traffic
const Ticker = ({ value }: { value: number }) => {
  // Refs
  const textRef = useRef< HTMLSpanElement >(null)

  // Hooks
  const shown = useMotionValue(value)

  useMotionValueEvent(shown, 'change', latest => {
    if (textRef.current) textRef.current.textContent = count.format(Math.round(latest))
  })

  useEffect(() => {
    const run = animate(shown, value, { duration: 0.9, ease: EASE_OUT })

    return () => run.stop()
  }, [shown, value])

  return (
    <span ref={textRef} className='tabular-nums'>
      {count.format(value)}
    </span>
  )
}

type HeroCopyProps = {
  reduceMotion: boolean

  // When the entrance begins: after the splash, or at once where there is none, seconds
  start: number
}

const HeroCopy = ({ reduceMotion, start }: HeroCopyProps) => {
  const { COPY, LIVE, CON_SPLASH } = useGoride()
  const entrada = CON_SPLASH

  // States
  const [phrase, setPhrase] = useState(0)
  const [city, setCity] = useState(0)
  const [rides, setRides] = useState(LIVE.cities[0]?.rides ?? 0)

  // Refs
  const rootRef = useRef< HTMLDivElement >(null)

  // Hooks

  /**
   * False on the server and while hydrating, true straight after, in the same pass that the screen
   * and motion queries resolve, so the entrance starts once with the right delay
   */
  const hidratado = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
  const ready = hidratado || !entrada

  // Vars

  // Each part comes in a beat after the last; under reduced motion everything is simply there
  const at = (delay: number) => (reduceMotion ? 0 : start + delay)

  // The yellow line rolls on to its next phrase, starting once the hero has come in
  useEffect(() => {
    const root = rootRef.current

    if (reduceMotion || !root || COPY.phrases.length < 2) return

    return repeatWhileShown(root, COPY.phraseEvery * 1000, (start + 1.4 + COPY.phraseEvery) * 1000, () =>
      setPhrase(value => (value + 1) % COPY.phrases.length)
    )
  }, [reduceMotion, start])

  // The ticker moves to the next city now and then, and its count drifts the way live traffic does
  useEffect(() => {
    const root = rootRef.current

    if (reduceMotion || !root || LIVE.cities.length < 2) return

    let tick = 0

    return repeatWhileShown(root, (LIVE.every / 3) * 1000, (LIVE.every / 3) * 1000, () => {
      tick++

      if (tick % 3 === 0) {
        const next = Math.floor(tick / 3) % LIVE.cities.length

        setCity(next)
        setRides(LIVE.cities[next].rides)
      } else {
        setRides(value => value + Math.round(Math.random() * 14) - 4)
      }
    })
  }, [reduceMotion])

  return (
    <div ref={rootRef} className='gr-copy pointer-events-auto relative z-10 flex flex-col items-start'>
      {/* Live ticker: rides on the road right now, city by city */}
      <m.p
        {...rise(at(0), ready, entrada)}
        className='gr-ticker flex items-center gap-2.5 rounded-[12px] py-1.5 pr-3.5 pl-1.5 text-[13px]'
 >
        <span className='gr-ticker-tag flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[10.5px] font-bold tracking-[0.12em]'>
          <span aria-hidden className='gr-live-dot' />
          {LIVE.tag}
        </span>
        <span className='text-gr-ink/70'>
          {/* Zplash: sin contador de viajes; cada "ciudad" es un mensaje completo que rota */}
          {/* Sized by an invisible copy of every city, so the slot always fits the longest name */}
          <span className='relative inline-grid overflow-hidden align-bottom'>
            {LIVE.cities.map(item => (
              <span key={item.name} aria-hidden className='invisible col-start-1 row-start-1 font-semibold'>
                {item.name}
              </span>
            ))}
            <AnimatePresence mode='popLayout' initial={false}>
              <m.span
                key={LIVE.cities[city]?.name}
                initial={{ transform: 'translateY(100%)', opacity: 0 }}
                animate={{ transform: 'translateY(0%)', opacity: 1 }}
                exit={{ transform: 'translateY(-100%)', opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
                className='text-gr-ink col-start-1 row-start-1 inline-block font-semibold'
 >
                {LIVE.cities[city]?.name}
              </m.span>
            </AnimatePresence>
          </span>
        </span>
      </m.p>

      {/* The first line rises from its mask; the yellow line keeps rolling through its phrases */}
      <h1 id='gr-title' className='gr-title font-gr-display mt-5 font-semibold'>
        <span className='block overflow-hidden pb-[0.06em]'>
          <m.span
            initial={entrada ? { transform: 'translateY(105%)' } : false}
            animate={{ transform: ready ? 'translateY(0%)' : 'translateY(105%)' }}
            transition={{ duration: 0.9, delay: at(0.08), ease: EASE_OUT }}
            className='block'
 >
            {COPY.headline}
          </m.span>
        </span>
        <span className='sr-only'>{COPY.phrases[0]}</span>
        <span aria-hidden className='gr-title-line text-gr-accent block min-h-[1em] pb-[0.08em]'>
          <m.span
            initial={entrada ? { transform: 'translateY(105%)' } : false}
            animate={{ transform: ready ? 'translateY(0%)' : 'translateY(105%)' }}
            transition={{ duration: 0.9, delay: at(0.2), ease: EASE_OUT }}
            className='block'
 >
            <AnimatePresence mode='wait' initial={false}>
              <Phrase key={COPY.phrases[phrase]} text={COPY.phrases[phrase] ?? ''} />
            </AnimatePresence>
          </m.span>
        </span>
      </h1>

      <m.p
        {...rise(at(0.3), ready, entrada)}
        className='gr-lede text-gr-ink/65 mt-5 max-w-[27rem] text-[16px] leading-[1.6] sm:text-[17px]'
 >
        {COPY.lede}
      </m.p>

      <m.div
        {...rise(at(0.42), ready, entrada)}
        className='mt-8 grid w-full gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-3'
 >
        <CtaButton href={COPY.primary.href} label={COPY.primary.label} hoverLabel={COPY.primary.hover} />
        <a href={COPY.secondary.href} className='gr-ghost gr-focus group'>
          <CarFront aria-hidden className='size-[18px]' />
          {COPY.secondary.label}
        </a>
      </m.div>

      {/* Where to get it, as a caption under the buttons rather than loose icons beside them */}
      {COPY.stores.length > 0 && (
      <m.p {...rise(at(0.48), ready, entrada)} className='text-gr-ink/55 mt-3.5 flex items-center gap-1 pl-0.5 text-[13px]'>
        Disponible en
        {COPY.stores.map((store, index) => {
          const Icon = store.id === 'android' ? GoridePlayIcon : GorideAppleIcon

          return (
            <span key={store.id} className='flex items-center gap-1'>
              {index > 0 && <span aria-hidden>·</span>}
              <a
                href={store.href}
                className='gr-focus text-gr-ink hover:bg-gr-ink/5 flex items-center gap-1.5 rounded-[7px] px-1.5 py-1 font-medium transition-colors'
 >
                <Icon className='text-gr-ink size-[14px]' />
                {store.label}
              </a>
            </span>
          )
        })}
      </m.p>
      )}

      {/* Riders and figures: avatars, stars that fill one by one, then the average pickup */}
      {COPY.rating && (
      <m.div {...rise(at(0.56), ready, entrada)} className='mt-6 flex items-center gap-4'>
        <span className='flex'>
          {COPY.riders.map((rider, index) => (
            <img
              key={rider.name}
              src={rider.src}
              alt={rider.name}
              width={112}
              height={112}
              loading='lazy'
              decoding='async'
              style={{ zIndex: COPY.riders.length - index }}
              className='gr-rider relative -ml-2.5 size-9 rounded-full object-cover first:ml-0'
            />
          ))}
        </span>
        <span className='leading-tight'>
          <span className='flex items-center gap-1.5'>
            <span className='flex gap-0.5'>
              {Array.from({ length: 5 }, (_, index) => (
                <m.span
                  key={index}
                  initial={{ transform: 'scale(0.4)', opacity: 0.25 }}
                  animate={ready ? { transform: 'scale(1)', opacity: 1 } : { transform: 'scale(0.4)', opacity: 0.25 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18, delay: at(0.7 + index * 0.08) }}
 >
                  <Star aria-hidden className='fill-gr-accent text-gr-accent size-3.5' />
                </m.span>
              ))}
            </span>
            <span className='text-gr-ink text-[14px] font-bold'>{COPY.rating}</span>
          </span>
          <span className='text-gr-ink/60 text-[12.5px] whitespace-nowrap'>{COPY.ratingNote}</span>
        </span>
        <span aria-hidden className='bg-gr-ink/10 hidden h-8 w-px sm:block' />
        <span className='hidden leading-tight whitespace-nowrap sm:block'>
          <span className='text-gr-ink block text-[15px] font-bold'>{COPY.stat.value}</span>
          <span className='text-gr-ink/60 text-[12.5px]'>{COPY.stat.label}</span>
        </span>
      </m.div>
      )}
    </div>
  )
}

// ---------- hero-section.tsx ----------
/**
 * Full screen, under the floating nav: the whole panel is the city, the copy sits on its quiet left
 * side and the phone stands beside it, or under it on phones
 */
const HeroSection = () => {
  // Refs
  const sectionRef = useRef< HTMLElement >(null)
  const copyRef = useRef< HTMLDivElement >(null)

  // Hooks

  // Hydration-safe: the first client render matches the server, which always plays the opening
  const reduceMotion = useReducedMotionPref()
  const small = useMediaQuery(SPLASH.skip)

  // Vars

  // Entrances wait for the splash to land in the phone; where there is no splash they start at once
  const { CON_SPLASH } = useGoride()
  const start = reduceMotion || small || !CON_SPLASH ? 0 : INTRO_AT

  // On phones the phone sits just under the copy, so the copy's real bottom edge is kept in a variable
  useEffect(() => {
    const section = sectionRef.current
    const copy = copyRef.current

    if (!section || !copy) return

    const measure = () => {
      const bottom = copy.getBoundingClientRect().bottom - section.getBoundingClientRect().top

      section.style.setProperty('--gr-copy-bottom', `${Math.round(bottom)}px`)
    }

    const observer = new ResizeObserver(measure)

    observer.observe(copy)
    observer.observe(section)
    measure()
    document.fonts?.ready.then(measure)

    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      aria-labelledby='gr-title'
      className='gr-panel bg-gr-panel relative isolate overflow-hidden'
 >
      <CityStage reduceMotion={reduceMotion} start={start} />

      {/* Frame and inset together, the same as the nav, so the copy lines up with the logo */}
      <div className='gr-frame gr-layout pointer-events-none relative z-[16]'>
        <div className='gr-inset w-full'>
          <div ref={copyRef} className='gr-container'>
            <HeroCopy reduceMotion={reduceMotion} start={start} />
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------- intro-splash.tsx ----------
/**
 * The app's splash over the whole screen: the logo, the name and a car driving the loading road. It
 * then closes down onto the phone's screen as a rounded clip and fades, so the splash becomes the app.
 * It is in the server markup, so nothing of the page shows before it
 */
const IntroSplash = () => {
  const { BRAND, TAGLINE } = useGoride()

  // States
  const [done, setDone] = useState(false)

  // Refs
  const layerRef = useRef< HTMLDivElement >(null)
  const contentRef = useRef< HTMLDivElement >(null)

  // Hooks
  const reduceMotion = useReducedMotionPref()
  const small = useMediaQuery(SPLASH.skip)

  // Vars
  const skip = reduceMotion || small

  useEffect(() => {
    const layer = layerRef.current
    const content = contentRef.current

    if (!layer || !content || skip) return

    let cancelled = false
    let current: { stop: () => void } | null = null

    const play = async () => {
      await new Promise(resolve => setTimeout(resolve, SPLASH.hold * 1000))

      if (cancelled) return

      const screen = layer.parentElement?.querySelector('.gr-screen')?.getBoundingClientRect()
      const width = window.innerWidth
      const height = window.innerHeight

      // If the phone's screen is out of view, the splash simply fades instead
      if (screen && screen.bottom < height + 20) {
        const inset = [screen.top, width - screen.right, height - screen.bottom, screen.left]
        const target = `inset(${inset.map(value => `${Math.round(value)}px`).join(' ')} round ${Math.round(screen.width * 0.13)}px)`

        animate(
          content,
          { transform: ['scale(1)', 'scale(0.42)'], opacity: 0 },
          { duration: SPLASH.shrink * 0.7, ease: EASE_OUT }
        )
        current = animate(
          layer,
          { clipPath: ['inset(0px 0px 0px 0px round 0px)', target] },
          { duration: SPLASH.shrink, ease: [0.76, 0, 0.24, 1] }
        )
        await current
      }

      if (cancelled) return

      current = animate(layer, { opacity: 0 }, { duration: SPLASH.fade, ease: 'easeOut' })
      await current

      if (!cancelled) setDone(true)
    }

    play()

    return () => {
      cancelled = true
      current?.stop()
    }
  }, [skip])

  if (done || skip) return null

  return (
    <div ref={layerRef} aria-hidden className='gr-splash fixed inset-0 z-[70] grid place-items-center'>
      <div ref={contentRef} className='flex flex-col items-center'>
        <m.span
          initial={{ opacity: 0, transform: 'scale(0.6) rotate(-12deg)' }}
          animate={{ opacity: 1, transform: 'scale(1) rotate(0deg)' }}
          transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.1 }}
          className='gr-splash-mark grid size-24 place-items-center rounded-[28px]'
 >
          {/* Zplash: el ícono oficial (cuadro oscuro con el logo) */}
          <img src='/icon-192.png' alt={BRAND.name} width={192} height={192} className='size-full rounded-[28px]' />
        </m.span>
        <m.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className='mt-2 text-[15px] font-medium'
 >
          {TAGLINE}
        </m.span>
        <span className='gr-splash-road relative mt-12 h-0 w-48'>
          <span className='gr-splash-car absolute top-0 left-0'>
            <VehicleIcon kind='car' length={30} className='block max-w-none' />
          </span>
        </span>
      </div>
    </div>
  )
}

// ---------- navbar.tsx ----------
/**
 * Page-level and sticky, above the hero panel rather than inside it. Clear at rest, frosted once the
 * page moves; its measured height is written to --gr-nav so the panel fills exactly what is left
 */
const Navbar = () => {
  const { BRAND, NAV } = useGoride()

  // States
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hovered, setHovered] = useState< number | null >(null)

  // Refs
  const headerRef = useRef< HTMLElement >(null)

  useEffect(() => {
    const header = headerRef.current
    const root = header?.closest< HTMLElement >('.gr-root')

    if (!header || !root) return

    const measure = () => {
      root.style.setProperty('--gr-nav', `${header.getBoundingClientRect().height}px`)
    }

    const handleScroll = () => {
      setScrolled(window.scrollY > 12)
    }

    const observer = new ResizeObserver(measure)

    observer.observe(header)
    measure()
    handleScroll()
    document.fonts?.ready.then(measure)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    const desktop = window.matchMedia('(min-width: 1024px)')

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    const handleResize = () => {
      if (desktop.matches) setMenuOpen(false)
    }

    window.addEventListener('keydown', handleKey)
    desktop.addEventListener('change', handleResize)

    return () => {
      window.removeEventListener('keydown', handleKey)
      desktop.removeEventListener('change', handleResize)
    }
  }, [menuOpen])

  return (
    <header ref={headerRef} data-scrolled={scrolled || menuOpen} className='gr-nav gr-frame sticky top-0 z-50'>
      <div className='gr-nav-shell'>
        <nav aria-label='Principal' className='gr-nav-bar relative flex h-[60px] items-center gap-6 lg:h-[64px]'>
          <a href={BRAND.href} className='gr-focus flex items-center gap-2.5 rounded-md'>
            <img src='/logo-oscuro.png' alt={BRAND.name} width={606} height={151} className='h-[30px] w-auto lg:h-[34px]' />
          </a>

          {/* A soft highlight slides to the link under the pointer; the current page keeps a yellow dot */}
          <ul
            onPointerLeave={() => setHovered(null)}
            className='absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 lg:flex'
 >
            {NAV.links.map((link, index) => (
              <li key={link.label} className='relative'>
                {hovered === index && (
                  <m.span
                    layoutId='gr-nav-hover'
                    aria-hidden
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                    className='gr-nav-hover absolute inset-0 rounded-[10px]'
                  />
                )}
                <a
                  href={link.href}
                  aria-current={index === 0 ? 'page' : undefined}
                  onPointerEnter={() => setHovered(index)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  className={cn(
                    'gr-focus relative flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[14.5px] font-medium transition-colors duration-200',
                    index === 0 || hovered === index ? 'text-gr-ink' : 'text-gr-ink/60'
                  )}
 >
                  {index === 0 && <span aria-hidden className='bg-gr-accent size-1.5 rounded-full' />}
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className='ml-auto flex items-center gap-2'>
            <a
              href={NAV.signIn.href}
              className='gr-focus text-gr-ink/75 hover:text-gr-ink hidden h-11 items-center rounded-[10px] px-4 text-[14.5px] font-medium transition-colors sm:flex'
 >
              {NAV.signIn.label}
            </a>
            <CtaButton
              href={NAV.cta.href}
              label={NAV.cta.label}
              hoverLabel={NAV.cta.hover}
              size='sm'
              className='hidden sm:inline-flex'
            />
            <button
              type='button'
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? 'gr-menu' : undefined}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setMenuOpen(value => !value)}
              className='gr-focus border-gr-line text-gr-ink grid size-11 cursor-pointer place-items-center rounded-[12px] border lg:hidden'
 >
              {menuOpen ? <X aria-hidden className='size-5' /> : <Menu aria-hidden className='size-5' />}
            </button>
          </div>
        </nav>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <m.div
            id='gr-menu'
            initial={{ opacity: 0, transform: 'translateY(-8px)' }}
            animate={{ opacity: 1, transform: 'translateY(0px)' }}
            exit={{ opacity: 0, transform: 'translateY(-6px)' }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className='gr-menu bg-gr-card absolute inset-x-3 top-[calc(100%_+_8px)] rounded-[18px] p-2 sm:inset-x-4 lg:hidden'
 >
            <ul className='grid'>
              {NAV.links.map(link => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className='gr-focus text-gr-ink hover:bg-gr-panel flex min-h-12 items-center rounded-[12px] px-3 text-[17px] font-medium'
 >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className='border-gr-line mt-2 grid grid-cols-2 gap-2 border-t pt-2 sm:hidden'>
              <a
                href={NAV.signIn.href}
                className='gr-focus border-gr-line flex h-12 items-center justify-center rounded-[12px] border text-[15px] font-semibold'
 >
                {NAV.signIn.label}
              </a>
              <a href={NAV.cta.href} className='gr-btn gr-focus w-full'>
                {NAV.cta.label}
              </a>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  )
}

// ---------- index.tsx ----------
const BLOCK_CSS = `@layer theme, base, components, utilities;
/* ---------- Shared alignment: the nav and the panel use the same two rules ---------- */

.gr-root {
  /* Widest the copy column and nav grow to; the city behind them still runs edge to edge */
  --gr-max: 1280px;
  --gr-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --gr-nav: 68px;
}

.gr-frame {
  padding-inline: 12px;
}

.gr-inset {
  padding-inline: 20px;
}

@media (min-width: 640px) {
  .gr-frame {
    padding-inline: 16px;
  }

  .gr-inset {
    padding-inline: 32px;
  }
}

@media (min-width: 1024px) {
  .gr-frame {
    padding-inline: 20px;
  }

  .gr-inset {
    padding-inline: 56px;
  }
}

.gr-root ::selection {
  background: var(--gr-accent);
  color: var(--gr-ink);
}

.gr-focus:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--gr-ink) 45%, transparent);
  outline-offset: 2px;
}

/* ---------- Navigation ---------- */

.gr-nav {
  /* Pulls the hero up under the bar, so the city runs to the very top of the screen */
  margin-bottom: calc(-1 * var(--gr-nav));
  padding-top: 12px;
}

/* A floating frosted bar, aligned to the same inset as the copy */
.gr-nav-shell {
  margin-inline: 8px;
}

.gr-nav-bar {
  border: 1px solid color-mix(in srgb, var(--gr-ink) 7%, transparent);
  border-radius: 16px;
  padding-inline: 12px 8px;
  background-color: color-mix(in srgb, var(--gr-panel) 72%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 12px 30px -20px rgba(60, 45, 20, 0.45);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  backdrop-filter: blur(16px) saturate(1.2);
  transition:
    background-color 0.3s,
    box-shadow 0.3s;
}

/* backdrop-filter does not transition, so only the tint and shadow change once the page moves */
.gr-nav[data-scrolled='true'] .gr-nav-bar {
  background-color: color-mix(in srgb, var(--gr-panel) 90%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 16px 36px -18px rgba(60, 45, 20, 0.5);
}

@media (min-width: 640px) {
  .gr-nav-shell {
    margin-inline: 16px;
  }
}

@media (min-width: 1024px) {
  /* Capped and centred on big screens, its logo on the same line as the copy below */
  .gr-nav-shell {
    max-width: calc(var(--gr-max) + 40px);
    margin-inline: max(36px, (100% - var(--gr-max) - 40px) / 2);
  }

  .gr-nav-bar {
    padding-inline: 18px 10px;
  }
}

.gr-nav-hover {
  background-color: color-mix(in srgb, var(--gr-ink) 6%, transparent);
}

.gr-menu {
  border: 1px solid var(--gr-line);
  box-shadow: 0 24px 60px -30px rgba(60, 45, 20, 0.45);
}

/* ---------- Buttons ---------- */

/* In the components layer, so a utility such as hidden can still switch a button off */
@layer components {
  .gr-btn {
    display: inline-flex;
    height: 52px;
    flex-shrink: 0;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border-radius: 12px;
    padding-inline: 26px;
    background-color: var(--gr-ink);
    color: #fff;
    font-size: 15.5px;
    font-weight: 600;
    white-space: nowrap;
    transition:
      background-color 0.3s var(--gr-ease),
      transform 0.15s var(--gr-ease);
  }

  .gr-btn:hover {
    background-color: color-mix(in srgb, var(--gr-ink) 86%, white);
  }

  .gr-btn:active {
    transform: scale(0.97);
  }
}

/* ---------- Hero panel ---------- */

/* Full screen and edge to edge, under the floating nav; only the bottom corners round off */
.gr-panel {
  /* On phones the phone sits under the copy: the panel grows to hold both, from the measured copy */
  min-height: calc(var(--gr-copy-bottom, 600px) + 40px + var(--gr-phone) * 2.07 + 36px);
  border-radius: 0 0 28px 28px;
}

/* Zplash: foto de fondo detrás del celular; el color del panel la cubre bajo el texto */
.gr-fondo::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, var(--gr-panel) 0%, var(--gr-panel) calc(var(--gr-copy-bottom, 600px) - 40px), transparent calc(var(--gr-copy-bottom, 600px) + 120px));
  content: '';
}

@media (min-width: 768px) {
  .gr-fondo::after {
    background: linear-gradient(90deg, var(--gr-panel) 0%, var(--gr-panel) 34%, color-mix(in srgb, var(--gr-panel) 55%, transparent) 50%, transparent 66%);
  }
}

/* Paper grain over the city, so the cream reads as printed stock rather than a flat fill */
.gr-panel::after {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.3 0 0 0 0 0.22 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  content: '';
  pointer-events: none;
}

.gr-layout {
  padding-top: calc(var(--gr-nav) + 28px);
}

/* From tablet up: one screen, copy on the left and the phone on the right */
@media (min-width: 768px) {
  .gr-panel {
    height: 100dvh;
    min-height: 720px;
  }

  .gr-layout {
    display: flex;
    height: 100%;
    align-items: center;
    padding-top: calc(var(--gr-nav) * 0.6);
  }
}

@media (min-width: 1024px) {
  .gr-panel {
    min-height: 680px;
    border-radius: 0 0 40px 40px;
  }
}

/* On phones the size is capped by the width, so the longest phrase still fits on its one line */
.gr-title {
  font-size: min(clamp(2.6rem, 1.2rem + 8vw, 5rem), calc(100cqi / 6.9));
  line-height: 0.92;
  letter-spacing: -0.05em;
}

/* The changing line never wraps, so the headline keeps its two lines whatever phrase is showing */
.gr-title-line {
  white-space: nowrap;
}

.gr-title-line .gr-phrase {
  flex-wrap: nowrap;
}

@media (min-width: 768px) {
  .gr-title {
    font-size: min(3.6rem, calc(100cqi / 6.9));
  }
}

@media (min-width: 1024px) {
  .gr-title {
    font-size: min(clamp(3.6rem, 1.8rem + 4.4vw, 6.8rem), 12dvh, calc(100cqi / 6.9));
  }
}

@media (min-width: 1800px) {
  .gr-title {
    font-size: min(7.6rem, 12dvh, calc(100cqi / 6.9));
  }
}

/* The copy column sits inside the same capped width as the nav */
.gr-container {
  width: 100%;
  max-width: var(--gr-max);
  margin-inline: auto;
}

/* A halo in the paper colour keeps the copy clean where the plan's lines run under it */
/* A size container, so the headline can scale to the column's own width and always fit one line */
.gr-copy {
  container-type: inline-size;
  max-width: 540px;
  text-shadow: 0 0 18px var(--gr-panel);
}

/* Tablet: the phone stands at the inset's right edge, so the copy keeps clear of it */
@media (min-width: 768px) {
  .gr-copy {
    max-width: calc(100% - var(--gr-phone) - 40px);
  }
}

/* Desktop: the phone stands at the column's right edge; the copy stops well before it */
@media (min-width: 1024px) {
  .gr-copy {
    max-width: min(560px, 100% - var(--gr-phone) - 64px);
  }
}

@media (min-width: 1536px) {
  .gr-copy {
    max-width: min(640px, 100% - var(--gr-phone) - 64px);
  }
}

/* ---------- The city plan ---------- */

@property --gr-reveal {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 0%;
}

/* The city draws outward in a ring from where the phone lands */
.gr-reveal {
  --gr-origin: 50% 74%;

  -webkit-mask-image: radial-gradient(
    circle at var(--gr-origin),
    #000 calc(var(--gr-reveal) - 16%),
    transparent var(--gr-reveal)
  );
  mask-image: radial-gradient(
    circle at var(--gr-origin),
    #000 calc(var(--gr-reveal) - 16%),
    transparent var(--gr-reveal)
  );
}

/* Quiet behind the copy, full strength where the phone roams */
.gr-plan {
  -webkit-mask-image: linear-gradient(to bottom, transparent 20%, #000 46%);
  mask-image: linear-gradient(to bottom, transparent 20%, #000 46%);
}

@media (min-width: 768px) {
  .gr-reveal {
    --gr-origin: 76% 50%;
  }

  .gr-plan {
    -webkit-mask-image: linear-gradient(100deg, rgba(0, 0, 0, 0.12) 18%, rgba(0, 0, 0, 0.35) 34%, #000 56%);
    mask-image: linear-gradient(100deg, rgba(0, 0, 0, 0.12) 18%, rgba(0, 0, 0, 0.35) 34%, #000 56%);
  }
}

.gr-district {
  color: color-mix(in srgb, var(--gr-ink) 8%, transparent);
  font-size: clamp(24px, 3.3vw, 56px);
  letter-spacing: -0.04em;
  transition: color 0.4s var(--gr-ease);
}

/* The district under the phone lights up in the brand yellow */
.gr-district-on {
  color: color-mix(in srgb, var(--gr-accent) 60%, transparent);
}

.gr-district-hover {
  color: color-mix(in srgb, var(--gr-ink) 18%, transparent);
}

/* ---------- On the paper: the drop-off flag and the pointer's tag ---------- */

.gr-flag {
  background-color: var(--gr-card);
  color: var(--gr-ink);
  box-shadow:
    0 0 0 1px var(--gr-line),
    0 14px 28px -16px rgba(60, 45, 20, 0.5);
}

.gr-flag-stem {
  background-color: var(--gr-ink);
}

.gr-cursor-ring {
  border: 1.5px solid color-mix(in srgb, var(--gr-ink) 45%, transparent);
  background-color: color-mix(in srgb, var(--gr-accent) 16%, transparent);
}

.gr-cursor-tag {
  background-color: var(--gr-ink);
  color: #fff;
}

/* A warm pool of light that travels with the phone */
.gr-phone-glow {
  inset: 8% -55%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--gr-accent) 26%, transparent), transparent);
  filter: blur(12px);
}

/* ---------- Phone ---------- */

/* Rests right of the copy on desktop, under it on phones; the drag moves it from here */
/* Phones: just under the measured copy, centred. Tablets: right of the copy, centred in height */
.gr-phone-spot {
  top: calc(var(--gr-copy-bottom, 600px) + 40px);
  left: calc(50% - var(--gr-phone) / 2);
  border-radius: calc(var(--gr-phone) * 0.165);
}

@media (min-width: 768px) {
  .gr-phone-spot {
    top: calc(50% + var(--gr-nav) / 2 - var(--gr-phone) * 1.03);
    left: auto;
    right: 40px;
  }
}

@media (min-width: 1024px) {
  .gr-phone-spot {
    /* Right edge on the nav button's right edge, mirroring the copy on the logo's left edge */
    right: calc((100% - min(100% - 152px, var(--gr-max))) / 2 - 10px);
  }
}

.gr-root {
  --gr-phone: min(258px, calc(100vw - 96px));
}

@media (min-width: 768px) {
  .gr-root {
    --gr-phone: clamp(236px, calc((100dvh - var(--gr-nav) - 140px) * 0.47), 268px);
  }
}

@media (min-width: 1024px) {
  .gr-root {
    --gr-phone: clamp(236px, calc((100dvh - var(--gr-nav) - 110px) * 0.47), 300px);
  }
}

@media (min-width: 1800px) {
  .gr-root {
    --gr-phone: clamp(236px, calc((100dvh - var(--gr-nav) - 110px) * 0.47), 340px);
  }
}

/* Sized by width with every part of the frame derived from it; the screen is 0.46 wide to tall */
.gr-phone {
  width: var(--gr-phone);
  padding: calc(var(--gr-phone) * 0.026);
  border-radius: calc(var(--gr-phone) * 0.165);
  background: linear-gradient(150deg, #d8c9b1 0%, #8a7b67 22%, #3b352e 52%, #a8977c 100%);
  box-shadow:
    0 60px 90px -45px rgba(60, 45, 20, 0.5),
    0 22px 40px -26px rgba(60, 45, 20, 0.45);
}

.gr-bezel {
  padding: calc(var(--gr-phone) * 0.022);
  border-radius: calc(var(--gr-phone) * 0.142);
  background-color: #0d0e10;
}

.gr-screen {
  container-type: inline-size;
  aspect-ratio: 0.46;
  border-radius: calc(var(--gr-phone) * 0.12);
  background-color: var(--gr-mapBlock);
  color: var(--gr-ink);
  isolation: isolate;
}

.gr-screen-top {
  background: linear-gradient(
    to bottom,
    var(--gr-card) 34%,
    color-mix(in srgb, var(--gr-card) 70%, transparent) 70%,
    transparent
  );
}

.gr-lens-car {
  filter: drop-shadow(0 2px 3px rgba(20, 22, 27, 0.3));
}

.gr-pin-shadow {
  background: radial-gradient(closest-side, rgba(20, 22, 27, 0.35), transparent);
}

.gr-search {
  background-color: var(--gr-card);
  box-shadow:
    0 0 0 1px var(--gr-line),
    0 10px 20px -14px rgba(20, 22, 27, 0.5);
}

.gr-sheet {
  background-color: var(--gr-card);
  box-shadow: 0 -12px 24px -18px rgba(20, 22, 27, 0.45);
}

.gr-hold {
  background-color: var(--gr-ink);
  touch-action: none;
}

.gr-avatar {
  border: 1.5px solid var(--gr-accent);
  background-color: var(--gr-accentSoft);
  color: var(--gr-ink);
}

/* The app's splash on the phone while it lands: GoRide yellow, the mark on a white tile */
.gr-splash {
  background: radial-gradient(70% 45% at 50% 42%, rgba(255, 255, 255, 0.35), transparent 70%), var(--gr-accent);
  color: var(--gr-ink);
}

/* Small screens never show it, not even for the moment before the page hydrates */
@media (max-width: 767px) {
  .gr-splash {
    display: none;
  }
}

.gr-splash-mark {
  background-color: var(--gr-card);
  box-shadow: 0 18px 30px -14px rgba(120, 80, 0, 0.45);
}

.gr-splash-mark svg rect {
  fill: transparent;
}

/* The loading bar is a road: a car drives it from one end to the other while the app starts */
.gr-splash-road {
  border-top: 2px dashed color-mix(in srgb, var(--gr-ink) 35%, transparent);
}

.gr-splash-car {
  animation: gr-drive 1.6s cubic-bezier(0.65, 0, 0.35, 1) 0.2s both;
}

@keyframes gr-drive {
  from {
    left: 0;
  }

  to {
    left: 100%;
  }
}

/* ---------- Live ticker and riders ---------- */

.gr-ticker {
  background-color: color-mix(in srgb, var(--gr-card) 80%, transparent);
  box-shadow:
    0 0 0 1px var(--gr-line),
    0 10px 24px -18px rgba(60, 45, 20, 0.5);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}

.gr-ticker-tag {
  background-color: var(--gr-ink);
  color: #fff;
}

.gr-rider {
  border: 2.5px solid var(--gr-panel);
  background-color: var(--gr-accentSoft);
}

/* ---------- Phone sheet details ---------- */

.gr-pay-mark {
  background-color: var(--gr-ink);
  color: #fff;
}

.gr-plate {
  border: 1px solid color-mix(in srgb, var(--gr-ink) 18%, transparent);
  background-color: var(--gr-panel);
}

.gr-pin-code {
  background-color: var(--gr-accentSoft);
  color: var(--gr-ink);
}

.gr-action {
  background-color: var(--gr-panel);
  color: var(--gr-ink);
}

.gr-rate {
  background-color: var(--gr-panel);
}

/* ---------- Download dock and nav button ---------- */

@layer components {
  /* Dark with a yellow arrow tile at its end; on hover the tile grows over the whole button */
  .gr-cta {
    position: relative;
    isolation: isolate;
    display: inline-flex;
    height: 56px;
    flex-shrink: 0;
    align-items: center;
    gap: 14px;
    overflow: hidden;
    border-radius: 14px;
    padding: 0 7px 0 22px;
    background: linear-gradient(180deg, #2a2d34 0%, var(--gr-ink) 100%);
    color: #fff;
    font-size: 15.5px;
    font-weight: 600;
    white-space: nowrap;
    text-shadow: none;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      0 1px 2px rgba(20, 22, 27, 0.3),
      0 14px 28px -14px rgba(20, 22, 27, 0.55);
    transition:
      color 0.45s var(--gr-ease),
      box-shadow 0.3s var(--gr-ease),
      transform 0.15s var(--gr-ease);
  }

  .gr-cta:hover {
    color: var(--gr-ink);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      0 1px 2px rgba(20, 22, 27, 0.2),
      0 18px 32px -14px color-mix(in srgb, var(--gr-accent) 80%, transparent);
  }

  .gr-cta:active {
    transform: scale(0.97);
  }

  /* The yellow that fills the button: it starts as exactly the arrow tile and grows from there */
  .gr-cta-fill {
    position: absolute;
    inset: 0;
    z-index: -1;
    background-color: var(--gr-accent);
    clip-path: inset(7px 7px 7px calc(100% - 49px) round 10px);
    transition: clip-path 0.55s var(--gr-ease);
  }

  .gr-cta:hover .gr-cta-fill {
    clip-path: inset(0 0 0 0 round 14px);
  }

  .gr-cta-tile {
    display: grid;
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    place-items: center;
    color: var(--gr-ink);
  }

  .gr-cta-arrow {
    width: 18px;
    height: 18px;
    transition: transform 0.45s var(--gr-ease);
  }

  .gr-cta:hover .gr-cta-arrow {
    transform: translate(2px, -2px) rotate(45deg);
  }

  .gr-cta-label {
    grid-area: 1 / 1;
    transition: transform 0.45s var(--gr-ease);
  }

  .gr-cta-label-hover {
    transform: translateY(110%);
  }

  .gr-cta:hover .gr-cta-label-rest {
    transform: translateY(-110%);
  }

  .gr-cta:hover .gr-cta-label-hover {
    transform: translateY(0);
  }

  /* On phones the two hero buttons stack at full width; the label sits left, the tile right */
  @media (max-width: 639px) {
    .gr-copy .gr-cta {
      justify-content: space-between;
    }

    .gr-copy .gr-ghost {
      justify-content: center;
    }
  }

  .gr-cta-sm {
    height: 44px;
    gap: 10px;
    border-radius: 12px;
    padding: 0 5px 0 16px;
    font-size: 14.5px;
  }

  .gr-cta-sm .gr-cta-fill {
    clip-path: inset(5px 5px 5px calc(100% - 39px) round 8px);
  }

  .gr-cta-sm:hover .gr-cta-fill {
    clip-path: inset(0 0 0 0 round 12px);
  }

  .gr-cta-sm .gr-cta-tile {
    width: 34px;
    height: 34px;
  }

  .gr-cta-sm .gr-cta-arrow {
    width: 15px;
    height: 15px;
  }

  /* The second action: same height, outlined, with a car; the border firms and it lifts on hover */
  .gr-ghost {
    display: inline-flex;
    height: 56px;
    align-items: center;
    gap: 9px;
    border-radius: 14px;
    padding: 0 20px 0 18px;
    background-color: color-mix(in srgb, var(--gr-card) 70%, transparent);
    color: var(--gr-ink);
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gr-ink) 14%, transparent);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    transition:
      box-shadow 0.25s var(--gr-ease),
      background-color 0.25s var(--gr-ease),
      transform 0.15s var(--gr-ease);
  }

  .gr-ghost:hover {
    background-color: var(--gr-card);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--gr-ink) 32%, transparent),
      0 12px 24px -16px rgba(60, 45, 20, 0.5);
  }

  .gr-ghost svg {
    transition: transform 0.35s var(--gr-ease);
  }

  .gr-ghost:hover svg {
    transform: translateX(2px);
  }

  .gr-ghost:active {
    transform: scale(0.97);
  }
}

.gr-live-dot {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background-color: var(--gr-accent);
}

.gr-live-dot::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-color: var(--gr-accent);
  content: '';
  animation: gr-ping 1.8s var(--gr-ease) infinite;
}

@keyframes gr-ping {
  from {
    transform: scale(1);
    opacity: 0.8;
  }

  to {
    transform: scale(2.8);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gr-cta-fill,
  .gr-cta-label,
  .gr-cta-arrow {
    transition: none;
  }

  .gr-live-dot::after,
  .gr-splash-car {
    animation: none;
  }
}

/* Utilities for the block's own colour and font tokens, written out because this file is not compiled by Tailwind */
@layer utilities {
  .bg-gr-accent\/10{background-color:color-mix(in oklab, var(--gr-accent) 10%, transparent)}
  .bg-gr-accent{background-color:var(--gr-accent)}
  .bg-gr-card{background-color:var(--gr-card)}
  .bg-gr-ink\/10{background-color:color-mix(in oklab, var(--gr-ink) 10%, transparent)}
  .bg-gr-ink\/15{background-color:color-mix(in oklab, var(--gr-ink) 15%, transparent)}
  .bg-gr-ink{background-color:var(--gr-ink)}
  .bg-gr-page{background-color:var(--gr-page)}
  .bg-gr-panel{background-color:var(--gr-panel)}
  .border-gr-ink{border-color:var(--gr-ink)}
  .border-gr-line{border-color:var(--gr-line)}
  .fill-gr-accent{fill:var(--gr-accent)}
  .font-gr-display{font-family:'Inter Tight', 'Inter', ui-sans-serif, system-ui, sans-serif}
  .font-gr-sans{font-family:'Inter', ui-sans-serif, system-ui, sans-serif}
  .hover\:bg-gr-ink\/5:hover{background-color:color-mix(in oklab, var(--gr-ink) 5%, transparent)}
  .hover\:bg-gr-panel:hover{background-color:var(--gr-panel)}
  .hover\:border-gr-ink\/30:hover{border-color:color-mix(in oklab, var(--gr-ink) 30%, transparent)}
  .hover\:text-gr-ink:hover{color:var(--gr-ink)}
  .text-gr-accent{color:var(--gr-accent)}
  .text-gr-grey{color:var(--gr-grey)}
  .text-gr-ink\/25{color:color-mix(in oklab, var(--gr-ink) 25%, transparent)}
  .text-gr-ink\/55{color:color-mix(in oklab, var(--gr-ink) 55%, transparent)}
  .text-gr-ink\/60{color:color-mix(in oklab, var(--gr-ink) 60%, transparent)}
  .text-gr-ink\/65{color:color-mix(in oklab, var(--gr-ink) 65%, transparent)}
  .text-gr-ink\/70{color:color-mix(in oklab, var(--gr-ink) 70%, transparent)}
  .text-gr-ink\/75{color:color-mix(in oklab, var(--gr-ink) 75%, transparent)}
  .text-gr-ink{color:var(--gr-ink)}
}
`

/**
 * GoRide ride-hailing hero: a paper city map with live cars, and a phone that is a window onto it.
 * Tap the map to set a drop-off, hold Book to call a car and follow the ride.
 *
 * Requires the `motion`, `lucide-react` and `cn` packages.
 *
 * @example
 * <GoRide brand={{ name: 'GoRide' }} copy={{ headline: 'The city,', phrases: ['in your hand.'] }} />
 */
const GoRide = ({
  className,
  theme,
  brand,
  nav,
  copy,
  live,
  driver,
  payment,
  tagline = DEFAULT_CONTENT.tagline,
  reducedMotion,
  cuenta,
  conMenu = true,
  conSplash = true,
  fondo = ''
}: GorideProps) => {
  const content = useMemo< GorideContent >(
    () => ({
      brand: { ...DEFAULT_CONTENT.brand, ...brand },
      nav: { ...DEFAULT_CONTENT.nav, ...nav },
      copy: { ...DEFAULT_CONTENT.copy, ...copy },
      live: { ...DEFAULT_CONTENT.live, ...live },
      driver: { ...DEFAULT_CONTENT.driver, ...driver },
      payment: { ...DEFAULT_CONTENT.payment, ...payment },
      tagline,
      reducedMotion,
      cuenta: { ...DEFAULT_CONTENT.cuenta, ...cuenta },
      conMenu,
      conSplash,
      fondo
    }),
    [brand, nav, copy, live, driver, payment, tagline, reducedMotion, cuenta, conMenu, conSplash, fondo]
  )

  // Theme roles become --gr-* variables, so the CSS and the SVG map read one palette
  const themeCss = `.gr-root{${Object.entries({ ...THEME, ...theme })
    .map(([role, value]) => `--gr-${role}:${value};`)
    .join('')}color-scheme:light}`

  return (
    <GorideContext.Provider value={content}>
      <style>{BLOCK_CSS}</style>
      <style>{themeCss}</style>
      <MotionProvider>
        <div
          data-slot='goride'
          className={cn('gr-root bg-gr-page font-gr-sans text-gr-ink min-h-dvh w-full antialiased', className)}
          // Zplash: sin menú propio, el hero no deja espacio arriba para la barra
          style={conMenu ? undefined : ({ '--gr-nav': '0px' } as React.CSSProperties)}
 >
          {conSplash && <IntroSplash />}
          {conMenu && <Navbar />}
          <main>
            <HeroSection />
          </main>
        </div>
      </MotionProvider>
    </GorideContext.Provider>
  )
}

export { GoRide }
export default GoRide
