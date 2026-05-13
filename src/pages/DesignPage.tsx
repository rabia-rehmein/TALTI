import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  Suspense,
  useRef,
  Component,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { MODELS } from '../lib/modelPaths'
import { applyGarmentFit } from '../lib/garmentFitBounds'
import {
  getModelOffset,
  getGarmentCamera,
  getGarmentCameraLookAt,
  getFitTarget,
} from '../lib/garmentView'
import { cn } from '../lib/utils'
import { useFooterChrome } from '../components/FooterChromeContext'
import { StudioViewerThemeToggle } from '../components/StudioViewerThemeToggle'
import { useAuth } from '../context/AuthContext'
import { canAccessApp } from '../lib/authUtils'
import { addOrIncrementCartLine } from '../lib/cartFirestore'
import type { CartPatternMap } from '../lib/firestoreTypes'
import {
  GARMENT_SIZES,
  getGarmentCatalog,
  type GarmentSize,
} from '../lib/garmentCatalog'

// ── Catalog ──────────────────────────────────────────────────────────

const GARMENTS = [
  { id: 'male-tshirt',  gender: 'male'   as const, label: 'T-Shirt',         path: MODELS.male.tshirt },
  { id: 'male-long-sleeve', gender: 'male' as const, label: 'Long Sleeve Shirt', path: MODELS.male.longSleeve },
  // { id: 'male-collar',  gender: 'male'   as const, label: 'Collar Shirt',    path: MODELS.male.collarButtonDown },
  { id: 'male-shirt',   gender: 'male'   as const, label: 'Baked Shirt',  path: MODELS.male.shirtBaked },
  // { id: 'female-btn',   gender: 'female' as const, label: 'Button Shirt', path: MODELS.female.buttonShirt },
  // { id: 'female-girls', gender: 'female' as const, label: 'Girls Shirt',  path: MODELS.female.girlsShirt },
  // { id: 'female-long',  gender: 'female' as const, label: 'Long Shirt',   path: MODELS.female.longShirt },
  { id: 'female-tee',   gender: 'female' as const, label: 'T-Shirt',      path: MODELS.female.tshirt },
] as const

for (const g of GARMENTS) {
  useGLTF.preload(g.path)
}

type GarmentEntry = (typeof GARMENTS)[number]
type Gender = 'male' | 'female'

/** Collar GLB can be off-catalog (commented in `GARMENTS`); compare as plain strings. */
function isCollarButtonDownPath(path: string): boolean {
  return path === MODELS.male.collarButtonDown
}

const COLORS = [
  { hex: '#8a8a8a', name: 'Slate'  },
  { hex: '#1c1c1c', name: 'Jet'    },
  { hex: '#f2ede6', name: 'Cream'  },
  { hex: '#2f4f7f', name: 'Navy'   },
  { hex: '#8b3a2a', name: 'Rust'   },
  { hex: '#4a7c59', name: 'Forest' },
  { hex: '#7b4f6b', name: 'Mauve'  },
  { hex: '#c4a882', name: 'Sand'   },
]

/** UV / tiling for uploaded pattern maps (MeshStandard `map`). */
type PatternMapSettings = {
  offsetU: number
  offsetV: number
  repeatU: number
  repeatV: number
  /**
   * Multiplies `repeatU` / `repeatV`. &lt; 1 → fewer repeats → larger print on the model;
   * &gt; 1 → more repeats → smaller print.
   */
  patternScale: number
  /** Mirror the pattern horizontally on the UV map (negative U repeat + offset). */
  invert: boolean
  /** Mirror the pattern vertically on the UV map (negative V repeat + offset). */
  invertV: boolean
}

const DEFAULT_PATTERN_MAP: PatternMapSettings = {
  offsetU: 0,
  offsetV: 0,
  repeatU: 1,
  repeatV: 1,
  patternScale: 1,
  invert: false,
  invertV: false,
}

/** Per-garment studio customizations (keyed by `GarmentEntry.id`). */
type GarmentDesignState = {
  /** Fabric tint hex, or `null` to use the GLB’s authored fabric colors */
  color: string | null
  /** Button tint (male t-shirt), or `null` for GLB-authored button materials */
  buttonColor: string | null
  extraColors: string[]
  extraButtonColors: string[]
  patternUrl: string | null
  patternName: string | null
  patternMap: PatternMapSettings
}

const DEFAULT_GARMENT_DESIGN: GarmentDesignState = {
  color: COLORS[0].hex,
  buttonColor: '#ffffff',
  extraColors: [],
  extraButtonColors: [],
  patternUrl: null,
  patternName: null,
  patternMap: { ...DEFAULT_PATTERN_MAP },
}

function mergeGarmentDesign(
  partial?: Partial<GarmentDesignState>,
): GarmentDesignState {
  return {
    color:
      partial?.color !== undefined
        ? partial.color
        : DEFAULT_GARMENT_DESIGN.color,
    buttonColor:
      partial?.buttonColor !== undefined
        ? partial.buttonColor
        : DEFAULT_GARMENT_DESIGN.buttonColor,
    extraColors: partial?.extraColors ?? DEFAULT_GARMENT_DESIGN.extraColors,
    extraButtonColors:
      partial?.extraButtonColors ?? DEFAULT_GARMENT_DESIGN.extraButtonColors,
    patternUrl: partial?.patternUrl ?? DEFAULT_GARMENT_DESIGN.patternUrl,
    patternName: partial?.patternName ?? DEFAULT_GARMENT_DESIGN.patternName,
    patternMap: {
      ...DEFAULT_PATTERN_MAP,
      ...partial?.patternMap,
    },
  }
}

function patternMapToCart(pm: PatternMapSettings): CartPatternMap {
  return {
    offsetU: pm.offsetU,
    offsetV: pm.offsetV,
    repeatU: pm.repeatU,
    repeatV: pm.repeatV,
    patternScale: pm.patternScale,
    invert: pm.invert,
    invertV: pm.invertV,
  }
}

function fabricColorLabel(hex: string | null, locked: boolean): string {
  if (locked) return 'Original'
  if (!hex) return 'Original'
  const c = COLORS.find((x) => x.hex.toLowerCase() === hex.toLowerCase())
  return c?.name ?? hex
}

function stableDesignKey(
  merged: GarmentDesignState,
  opts: { collarLocked: boolean; isTshirt: boolean },
): string {
  const pm = merged.patternMap
  const pmPart = [
    pm.offsetU,
    pm.offsetV,
    pm.repeatU,
    pm.repeatV,
    pm.patternScale,
    pm.invert,
    pm.invertV,
  ].join('|')
  const colorPart = opts.collarLocked ? '_' : merged.color ?? ''
  const btn = opts.isTshirt ? merged.buttonColor ?? '' : ''
  return [colorPart, btn, merged.patternName ?? '', pmPart].join('~')
}

function buildVariantLabel(
  size: GarmentSize,
  merged: GarmentDesignState,
  collarLocked: boolean,
  isTshirt: boolean,
): string {
  const parts = [
    `Size ${size}`,
    `Fabric ${fabricColorLabel(merged.color, collarLocked)}`,
  ]
  if (isTshirt) {
    parts.push(`Buttons ${fabricColorLabel(merged.buttonColor, false)}`)
  }
  if (merged.patternName) parts.push(`Pattern ${merged.patternName}`)
  return parts.join(' · ')
}

const studioSelChipBase =
  'rounded-md px-3 py-1.5 font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold uppercase tracking-[0.1em] ring-1 ring-inset transition-colors duration-150 min-w-[2.5rem]'
const studioSelChipIdle =
  'bg-transparent text-[color-mix(in_oklab,var(--ink)_45%,transparent)] ring-white/[0.1] hover:bg-white/[0.04] hover:text-[color-mix(in_oklab,var(--ink)_72%,transparent)]'
const studioSelChipOn =
  'bg-white/[0.08] text-[color-mix(in_oklab,var(--ink)_88%,transparent)] ring-white/[0.18]'

function applyPatternMapToTexture(
  tex: THREE.Texture,
  pm: PatternMapSettings,
): void {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.center.set(0.5, 0.5)
  tex.rotation = 0
  const mul = Math.min(16, Math.max(0.125, pm.patternScale))
  const ru = Math.min(16, Math.max(0.25, pm.repeatU * mul))
  const rv = Math.min(16, Math.max(0.25, pm.repeatV * mul))

  const repU = pm.invert ? -ru : ru
  const repV = pm.invertV ? -rv : rv
  const offU = pm.invert ? ru - pm.offsetU : pm.offsetU
  const offV = pm.invertV ? rv - pm.offsetV : pm.offsetV
  tex.repeat.set(repU, repV)
  tex.offset.set(offU, offV)
  tex.needsUpdate = true
}

const ease = [0.22, 1, 0.36, 1] as const

/** MinimalistHero `.cta` — black pill, DM Sans, wide tracking */
const ctaHero =
  'inline-flex w-full cursor-pointer items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--ink)_82%,transparent)] px-7 py-3.5 text-center font-[family-name:var(--font-sans)] text-[0.88rem] font-bold uppercase tracking-[0.12em] text-[var(--bg)] transition-[background,transform] duration-200 ease-out hover:-translate-y-px hover:bg-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)]'

/** GlassHeader `.brand` / hero wordmark family — Cormorant italic */
const titleHero =
  'font-[family-name:var(--font-vogue)] font-semibold italic uppercase tracking-[0.06em] text-[color-mix(in_oklab,var(--ink)_82%,transparent)]'

/** GlassHeader `.link` — nav chrome */
const navMuted = 'text-[color-mix(in_oklab,var(--ink)_38%,transparent)]'
const navActive = 'text-[color-mix(in_oklab,var(--ink)_82%,transparent)]'

/** MinimalistHero `.barTag` */
const barTag =
  'font-[family-name:var(--font-sans)] text-[0.82rem] font-semibold uppercase tracking-[0.16em] text-[color-mix(in_oklab,var(--ink)_42%,transparent)]'

/** MinimalistHero `.tagline` — supporting Vogue line */
const taglineHero =
  'font-[family-name:var(--font-vogue)] font-light italic tracking-[0.02em] text-[color-mix(in_oklab,var(--ink)_52%,transparent)]'

/** Vogue title on dark canvas (viewer chrome) */
const titleOnDark =
  'font-[family-name:var(--font-vogue)] font-semibold italic uppercase tracking-[0.06em] text-white/[0.92]'

const titleOnLightCanvas =
  'font-[family-name:var(--font-vogue)] font-semibold italic uppercase tracking-[0.06em] text-[color-mix(in_oklab,var(--studio-on-light-fg)_90%,transparent)]'

/** Nav-style control on dark background */
const controlOnDark =
  'rounded-full border border-white/20 bg-white/[0.06] px-5 py-2 font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/[0.82] transition-colors duration-200 hover:border-white/30 hover:bg-white/[0.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

/** Same control on muted grey cyclorama — dark type + subtle dark glass */
const controlOnLightCanvas =
  'rounded-full border border-[color-mix(in_oklab,var(--studio-on-light-fg)_14%,transparent)] bg-[color-mix(in_oklab,var(--studio-on-light-fg)_7%,transparent)] px-5 py-2 font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[color-mix(in_oklab,var(--studio-on-light-fg)_78%,transparent)] transition-colors duration-200 hover:border-[color-mix(in_oklab,var(--studio-on-light-fg)_24%,transparent)] hover:bg-[color-mix(in_oklab,var(--studio-on-light-fg)_11%,transparent)] hover:text-[color-mix(in_oklab,var(--studio-on-light-fg)_92%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

/** Studio zoom (− / reset / +) — shared shape; colors split by viewer theme */
const studioZoomBtnBase =
  'flex size-8 shrink-0 items-center justify-center rounded-full border backdrop-blur-sm transition-[background,border-color,color,transform] duration-200 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none md:size-9'

const studioZoomChromeDark =
  'border-white/[0.12] bg-white/[0.04] text-white/[0.78] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.22] hover:bg-white/[0.1] hover:text-white focus-visible:outline-white/35 disabled:opacity-[0.32] [&_svg]:stroke-current'

const studioZoomChromeLight =
  'border-[color-mix(in_oklab,var(--studio-on-light-fg)_12%,transparent)] bg-[color-mix(in_oklab,var(--studio-on-light-fg)_5%,transparent)] text-[color-mix(in_oklab,var(--studio-on-light-fg)_62%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] hover:border-[color-mix(in_oklab,var(--studio-on-light-fg)_20%,transparent)] hover:bg-[color-mix(in_oklab,var(--studio-on-light-fg)_9%,transparent)] hover:text-[color-mix(in_oklab,var(--studio-on-light-fg)_92%,transparent)] focus-visible:outline-[color-mix(in_oklab,var(--studio-on-light-fg)_28%,transparent)] disabled:opacity-[0.32] [&_svg]:stroke-current'

// ── Helpers ──────────────────────────────────────────────────────────

function useIsNarrow(bp = 768) {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < bp,
  )
  useEffect(() => {
    const fn = () => setNarrow(window.innerWidth < bp)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [bp])
  return narrow
}

// ── Error boundary — catches missing GLB 404s gracefully ─────────────

class ModelBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

// ── Placeholder 3D mesh (shown when GLB is absent / loading) ─────────

function PlaceholderMesh({ compact }: { compact: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state, delta) => {
    if (!ref.current) return
    if (compact) ref.current.rotation.y += delta * 0.5
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.03
  })
  const s = compact ? 0.5 : 1
  return (
    <mesh ref={ref} scale={[s, s * 1.45, s * 0.22]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#9a9490" roughness={0.88} metalness={0} />
    </mesh>
  )
}

// Fit + offsets: `garmentFit.ts` / `garmentView.ts`. Bounds use precise `Box3` (see `garmentFitBounds`).

// ── GLB model — centred + uniformly scaled to frame; spins when compact ─

function GarmentGLB({
  path,
  compact,
  userScale = 1,
  studioMobile = false,
  tintHex,
  buttonTintHex,
  patternUrl,
  patternMap,
}: {
  path: string
  compact: boolean
  userScale?: number
  /** Narrow phone studio — larger fit + lower framing (see `garmentView` mobile constants) */
  studioMobile?: boolean
  tintHex?: string
  buttonTintHex?: string
  patternUrl?: string | null
  patternMap: PatternMapSettings
}) {
  const { scene } = useGLTF(path)
  const animRef = useRef<THREE.Group>(null)
  const poseRef = useRef<THREE.Group>(null)
  const fitRef = useRef<THREE.Group>(null)
  const needsFitRef = useRef(true)
  const studioOpts = useMemo(
    () => ({ mobileStudio: !compact && studioMobile }),
    [compact, studioMobile],
  )
  const fitTarget = useMemo(
    () => getFitTarget(path, compact, studioOpts),
    [path, compact, studioOpts],
  )
  const offset = useMemo(
    () => getModelOffset(path, compact, studioOpts),
    [path, compact, studioOpts],
  )
  const patternTexRef = useRef<THREE.Texture | null>(null)
  const [patternTick, setPatternTick] = useState(0)
  const clone = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((obj) => {
      obj.visible = true
      const m = obj as THREE.Mesh
      if (m.isMesh) {
        m.frustumCulled = false
        if (m.material) {
          const cloneMat = (mat: THREE.Material) => {
            const cm = mat.clone()
            const u =
              (cm as unknown as { userData?: Record<string, unknown> }).userData ??=
              {}
            u.__baseMap = (cm as unknown as { map?: unknown }).map ?? null
            const std = cm as THREE.MeshStandardMaterial
            if (std.color?.isColor) {
              u.__baseColor = std.color.clone()
            }
            return cm
          }
          m.material = Array.isArray(m.material)
            ? m.material.map((mat) => (mat ? cloneMat(mat) : mat))
            : cloneMat(m.material)
        }
      }
      const l = obj as THREE.Line
      if (l.isLine) l.frustumCulled = false
      const p = obj as THREE.Points
      if (p.isPoints) p.frustumCulled = false
    })
    return c
  }, [scene])

  useEffect(() => {
    let cancelled = false
    let texToDispose: THREE.Texture | null = null

    if (!patternUrl) return

    const loader = new THREE.TextureLoader()
    loader.load(
      patternUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        tex.needsUpdate = true
        texToDispose = tex
        patternTexRef.current = tex
        setPatternTick((t) => t + 1)
      },
      undefined,
      () => {
        if (cancelled) return
        patternTexRef.current = null
        setPatternTick((t) => t + 1)
      },
    )

    return () => {
      cancelled = true
      if (texToDispose) texToDispose.dispose()
      if (patternTexRef.current === texToDispose) patternTexRef.current = null
    }
  }, [patternUrl])

  useLayoutEffect(() => {
    const patternTex = patternUrl ? patternTexRef.current : null
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return

      const meshName = (mesh.name ?? '').toLowerCase()
      const applyToMaterial = (mat: THREE.Material) => {
        const anyMat = mat as unknown as {
          map?: unknown
          name?: string
          userData?: Record<string, unknown>
        }
        const matName = (anyMat.name ?? mat.name ?? '').toLowerCase()

        const isMaleCollar = path === MODELS.male.collarButtonDown
        const isButtonPart = isMaleCollar
          ? /(button|zip)/i.test(meshName)
          : /(button|zip|metal|snap|eyelet|ring)/i.test(matName) ||
            /(button|zip)/i.test(meshName)

        if (isButtonPart) return

        const baseMap = (anyMat.userData?.__baseMap as unknown) ?? null
        const nextMap = patternTex ? patternTex : (baseMap as unknown)
        if (anyMat.map !== nextMap) {
          anyMat.map = nextMap
          mat.needsUpdate = true
        }
      }

      if (Array.isArray(mesh.material)) mesh.material.forEach(applyToMaterial)
      else applyToMaterial(mesh.material)
    })

    if (patternTex) applyPatternMapToTexture(patternTex, patternMap)
  }, [
    clone,
    patternUrl,
    patternTick,
    path,
    patternMap,
  ])

  useLayoutEffect(() => {
    const fabricTint = tintHex ? new THREE.Color(tintHex) : null
    const buttonTint = buttonTintHex ? new THREE.Color(buttonTintHex) : null

    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return

      const meshName = (mesh.name ?? '').toLowerCase()
      const applyToMaterial = (mat: THREE.Material) => {
        const anyMat = mat as unknown as {
          color?: THREE.Color
          map?: unknown
          name?: string
          userData?: Record<string, unknown>
        }
        if (!anyMat.color || !anyMat.color.isColor) return
        const matName = (anyMat.name ?? mat.name ?? '').toLowerCase()
        const base = anyMat.userData?.__baseColor as THREE.Color | undefined
        if (!base) return

        // Classify as button-part vs fabric-part.
        //
        // NOTE: the male collar shirt GLB names its *fabric* material with "button_down",
        // which would be incorrectly tagged by a generic "button" check. For that model,
        // only mesh-name detection is reliable.
        const isMaleCollar = path === MODELS.male.collarButtonDown
        const isButtonPart = isMaleCollar
          ? /(button|zip)/i.test(meshName)
          : /(button|zip|metal|snap|eyelet|ring)/i.test(matName) ||
            /(button|zip)/i.test(meshName)

        if (isButtonPart) {
          anyMat.color.copy(buttonTint ?? base)
        } else {
          anyMat.color.copy(fabricTint ?? base)
        }
        mat.needsUpdate = true
      }

      if (Array.isArray(mesh.material)) mesh.material.forEach(applyToMaterial)
      else applyToMaterial(mesh.material)
    })
  }, [clone, tintHex, buttonTintHex, path])

  useLayoutEffect(() => {
    needsFitRef.current = true
    const g = fitRef.current
    if (!g) return
    if (applyGarmentFit(g, fitTarget)) {
      needsFitRef.current = false
    }
  }, [clone, compact, path, fitTarget])

  useFrame(() => {
    if (!needsFitRef.current) return
    const g = fitRef.current
    if (!g) return
    if (applyGarmentFit(g, fitTarget)) {
      needsFitRef.current = false
    }
  })

  useFrame((state, delta) => {
    if (compact && animRef.current) animRef.current.rotation.y += delta * 0.4
    if (!poseRef.current) return
    const bobAmp = compact ? 0.025 : studioMobile ? 0.012 : 0.025
    const bob = Math.sin(state.clock.elapsedTime * 0.7) * bobAmp
    poseRef.current.position.set(offset.x, offset.y + bob, offset.z)
  })

  return (
    <group ref={animRef}>
      {/* Wheel zoom only — keep bbox fit separate so Y pose from `garmentView` doesn’t reset on scroll */}
      <group scale={userScale}>
        <group ref={poseRef}>
          <group ref={fitRef}>
            <primitive object={clone} />
          </group>
        </group>
      </group>
    </group>
  )
}

const STUDIO_ZOOM_MIN = 0.45
const STUDIO_ZOOM_MAX = 2.6
/** Multiplicative step per +/− control (~8% per click for noticeable range without huge jumps) */
const STUDIO_ZOOM_STEP_FACTOR = 1.08

/** Keeps camera aligned with `garmentView` whenever path/mode changes (R3F `camera` prop is mount-only). */
function SyncGarmentCamera({
  position,
  lookAt = [0, 0, 0] as const,
}: {
  position: readonly [number, number, number]
  lookAt?: readonly [number, number, number]
}) {
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2])
    camera.updateProjectionMatrix()
  }, [camera, position, lookAt])
  return null
}

function SyncPerspectiveFov({ fov }: { fov: number }) {
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    const p = camera as THREE.PerspectiveCamera
    if (p.isPerspectiveCamera) {
      /* R3F: PerspectiveCamera must be updated imperatively when FOV changes (e.g. breakpoint resize). */
      // eslint-disable-next-line react-hooks/immutability -- three.js camera API
      p.fov = fov
      p.updateProjectionMatrix()
    }
  }, [camera, fov])
  return null
}

// ── Shared canvas (mini card preview OR full studio) ─────────────────

function GarmentCanvas({
  path,
  compact,
  studioZoom: studioZoomProp,
  setStudioZoom: setStudioZoomProp,
  viewerLight = false,
  studioMobile = false,
  tintHex,
  buttonTintHex,
  patternUrl,
  patternMap = DEFAULT_PATTERN_MAP,
}: {
  path: string
  compact: boolean
  studioZoom?: number
  setStudioZoom?: Dispatch<SetStateAction<number>>
  /** Studio viewer: lighter backdrop + lighting */
  viewerLight?: boolean
  /** Stacked studio (&lt; `lg`): bigger fit, tuned camera — not only narrow phones */
  studioMobile?: boolean
  tintHex?: string
  buttonTintHex?: string
  patternUrl?: string | null
  patternMap?: PatternMapSettings
}) {
  const placeholder = <PlaceholderMesh compact={compact} />
  const studioOpts = useMemo(
    () => ({ mobileStudio: !compact && studioMobile }),
    [compact, studioMobile],
  )
  const cameraPosition = useMemo(
    () => getGarmentCamera(path, compact, studioOpts),
    [path, compact, studioOpts],
  )
  const cameraLookAt = useMemo(
    () => getGarmentCameraLookAt(path, compact, studioOpts),
    [path, compact, studioOpts],
  )
  const orbitTarget = useMemo(
    () => new THREE.Vector3(cameraLookAt[0], cameraLookAt[1], cameraLookAt[2]),
    [cameraLookAt],
  )
  // Narrower than 50 — wide FOV shrinks the subject; size comes from `MOBILE_STUDIO_FIT_MUL` + camera Z.
  const studioFov = compact ? 40 : studioMobile ? 42 : 34
  const clipNear = compact ? 0.1 : 0.012
  const [internalZoom, setInternalZoom] = useState(1)
  const controlled =
    studioZoomProp !== undefined && setStudioZoomProp !== undefined
  const studioZoom = compact ? 1 : controlled ? studioZoomProp : internalZoom
  const studioWheelRef = useRef<HTMLDivElement>(null)
  const setZoomRef = useRef<Dispatch<SetStateAction<number>>>(setInternalZoom)
  useLayoutEffect(() => {
    setZoomRef.current =
      compact || !controlled
        ? setInternalZoom
        : (setStudioZoomProp as Dispatch<SetStateAction<number>>)
  }, [compact, controlled, setInternalZoom, setStudioZoomProp])

  useEffect(() => {
    if (compact) return
    const el = studioWheelRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dy = e.deltaY
      const dir = dy > 0 ? -1 : 1
      setZoomRef.current((z) => {
        const next = z * (1 + dir * 0.07)
        return Math.min(STUDIO_ZOOM_MAX, Math.max(STUDIO_ZOOM_MIN, next))
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [compact])

  return (
    <div
      ref={studioWheelRef}
      className={cn(
        'size-full min-h-0',
        /* Orbit drags must not chain to scrollable ancestors (aside / page) on touch devices */
        !compact && 'touch-none',
      )}
    >
      <Canvas
        dpr={compact ? 1 : [1, 2]}
        camera={{
          position: cameraPosition,
          fov: studioFov,
          near: clipNear,
          far: 2000,
        }}
        gl={{ alpha: true, antialias: true }}
        className="size-full touch-none bg-transparent"
        style={
          !compact
            ? {
                width: '100%',
                height: '100%',
                display: 'block',
                touchAction: 'none',
              }
            : undefined
        }
      >
      <SyncGarmentCamera position={cameraPosition} lookAt={cameraLookAt} />
      {!compact && <SyncPerspectiveFov fov={studioFov} />}
      <ambientLight intensity={viewerLight && !compact ? 0.62 : 0.55} />
      <directionalLight
        position={[2, 4, 3]}
        intensity={viewerLight && !compact ? 0.88 : 1.3}
      />
      <directionalLight
        position={[-3, 1, -2]}
        intensity={viewerLight && !compact ? 0.32 : 0.28}
      />
      <Environment preset={viewerLight && !compact ? 'studio' : 'city'} />
      {!compact && (
        <>
          <ContactShadows
            position={[0, -1.3, 0]}
            opacity={viewerLight ? 0.12 : 0.18}
            scale={3}
            blur={2.5}
            far={1.5}
            color={viewerLight ? '#141414' : '#000000'}
          />
          <OrbitControls
            target={orbitTarget}
            enablePan={false}
            enableZoom={false}
            minPolarAngle={studioMobile ? Math.PI / 5.5 : Math.PI / 4}
            maxPolarAngle={studioMobile ? Math.PI * 0.85 : Math.PI * 0.75}
          />
        </>
      )}
      <Suspense fallback={placeholder}>
        <ModelBoundary key={path} fallback={placeholder}>
          <GarmentGLB
            path={path}
            compact={compact}
            userScale={compact ? 1 : studioZoom}
            studioMobile={studioMobile}
            tintHex={tintHex}
            buttonTintHex={buttonTintHex}
            patternUrl={patternUrl}
            patternMap={patternMap}
          />
        </ModelBoundary>
      </Suspense>
    </Canvas>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────

function GarmentCard({
  garment,
  index,
  design,
  onSelect,
}: {
  garment: GarmentEntry
  index: number
  design: GarmentDesignState
  onSelect: () => void
}) {
  const isMaleCollarCard = isCollarButtonDownPath(garment.path)
  const isMaleTshirtCard = garment.path === MODELS.male.tshirt
  const meta = getGarmentCatalog(garment.id)

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl text-left',
        'bg-[color-mix(in_oklab,var(--bg-elevated)_38%,transparent)] backdrop-blur-xl backdrop-saturate-150',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_0_rgba(0,0,0,0.35),0_8px_24px_-12px_rgba(0,0,0,0.45)]',
        'ring-1 ring-inset ring-white/[0.06]',
        'transition-[box-shadow,background-color,transform] duration-300 ease-out',
        'hover:bg-[color-mix(in_oklab,var(--bg-elevated)_52%,transparent)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_0_rgba(0,0,0,0.35),0_18px_36px_-14px_rgba(0,0,0,0.65)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--outline-focus)]',
      )}
    >
      {/* Stage — model floats on the frosted surface */}
      <div className="relative aspect-[3/4] w-full">
        <GarmentCanvas
          path={garment.path}
          compact
          tintHex={
            isMaleCollarCard ? undefined : (design.color ?? undefined)
          }
          buttonTintHex={
            isMaleTshirtCard ? (design.buttonColor ?? undefined) : undefined
          }
          patternUrl={design.patternUrl}
          patternMap={design.patternMap}
        />

        {/* Eyebrow gender label — top-left, ultra subtle */}
        <span
          className={cn(
            'absolute left-3 top-3 z-10 font-[family-name:var(--font-sans)]',
            'text-[0.58rem] font-semibold uppercase tracking-[0.18em]',
            'text-[color-mix(in_oklab,var(--ink)_34%,transparent)] transition-colors duration-200 group-hover:text-[color-mix(in_oklab,var(--ink)_55%,transparent)]',
          )}
        >
          {garment.gender}
        </span>
      </div>

      {/* Footer — label + minimal SKU / price */}
      <div className="border-t border-white/12 bg-[color-mix(in_oklab,var(--ink)_5%,transparent)] px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 min-w-0 truncate font-[family-name:var(--font-sans)] text-[0.78rem] font-medium leading-tight tracking-[-0.015em] text-[color-mix(in_oklab,var(--ink)_82%,transparent)]">
            {garment.label}
          </p>
          <span
            className="shrink-0 font-mono text-[0.72rem] tabular-nums text-[color-mix(in_oklab,var(--ink)_72%,transparent)]"
            aria-hidden
          >
            ${meta.price}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-[family-name:var(--font-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[color-mix(in_oklab,var(--ink)_32%,transparent)]">
            {meta.sku}
          </span>
          <span
            className="shrink-0 text-[0.68rem] text-[color-mix(in_oklab,var(--ink)_28%,transparent)] transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-[color-mix(in_oklab,var(--ink)_55%,transparent)]"
            aria-hidden
          >
            →
          </span>
        </div>
        <p className="m-0 mt-0.5 truncate font-[family-name:var(--font-sans)] text-[0.65rem] leading-snug text-[color-mix(in_oklab,var(--ink)_45%,transparent)]">
          {meta.blurb}
        </p>
      </div>
    </motion.button>
  )
}

function PanelSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--ink)_40%,transparent)]">
        {label}
      </h3>
      {children}
    </div>
  )
}

function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null
  return `#${s.toLowerCase()}`
}

const patternFieldResetBtnClass =
  'flex size-8 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[color-mix(in_oklab,var(--ink)_28%,transparent)] transition-colors duration-150 hover:text-[color-mix(in_oklab,var(--ink)_62%,transparent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/12 disabled:pointer-events-none disabled:opacity-[0.18]'

function FabricColorPicker({
  value,
  onChange,
  extraColors,
  onAddColor,
  onResetToModel,
  preferPopoverAbove = false,
  resetControlTitle = 'Original model color',
  resetControlAriaLabel = 'Restore original model fabric color',
  originalValueCaption = 'Model original',
}: {
  value: string | null
  onChange: (hex: string) => void
  extraColors: string[]
  onAddColor: (hex: string) => void
  /** Restore GLB-authored colors for this control (no tint) */
  onResetToModel?: () => void
  /** Stacked studio: open popover upward so it stays in view on phones */
  preferPopoverAbove?: boolean
  resetControlTitle?: string
  resetControlAriaLabel?: string
  /** Caption when `value` is `null` (authored materials) */
  originalValueCaption?: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [fixedPopoverLayout, setFixedPopoverLayout] =
    useState<CSSProperties | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const normalized = useMemo(() => normalizeHex(draft), [draft])

  const activeHex =
    value == null ? null : normalizeHex(value) ?? value.toLowerCase()
  const colorWheelFallback = COLORS[0].hex
  const allSaved = useMemo(
    () => [...COLORS.map((c) => c.hex.toLowerCase()), ...extraColors],
    [extraColors],
  )
  const alreadySaved = normalized ? allSaved.includes(normalized) : false

  const openPicker = () => {
    setDraft(
      value == null ? '' : (normalizeHex(value) ?? value).replace('#', ''),
    )
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  /**
   * Stacked studio: measure anchor for a `document.body` portal. In-tree `fixed` is wrong here because
   * Framer Motion’s `transform` on ancestors redefines the fixed containing block, so the sheet stayed
   * under the WebGL canvas and was clipped by overflow.
   */
  useLayoutEffect(() => {
    if (!open || !preferPopoverAbove) return

    const update = () => {
      const el = panelRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const margin = 10
      const vv = window.visualViewport
      const vw = vv?.width ?? window.innerWidth
      const vh = vv?.height ?? window.innerHeight
      const inset = 12
      const maxWidth = Math.min(r.width, vw - 2 * inset)
      const left = Math.max(inset, Math.min(r.left, vw - maxWidth - inset))
      const spaceAbove = Math.max(0, r.top - margin)
      const topReserve = 8
      const maxH = Math.max(140, Math.min(360, spaceAbove - topReserve))
      setFixedPopoverLayout({
        position: 'fixed',
        left,
        width: maxWidth,
        bottom: vh - r.top + margin,
        maxHeight: maxH,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        zIndex: 999999,
        WebkitOverflowScrolling: 'touch',
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => {
      setFixedPopoverLayout(null)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
    }
  }, [open, preferPopoverAbove])

  const activeName =
    value == null
      ? originalValueCaption
      : COLORS.find((c) => c.hex.toLowerCase() === activeHex)?.name ?? 'Custom'

  const swatchRing = (active: boolean) =>
    active
      ? 'shadow-[0_0_0_1.5px_var(--bg-elevated),0_0_0_2.5px_rgba(255,255,255,0.45)]'
      : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]'

  /** Slightly larger than 18px swatches so controls stay tappable; same row `gap` as swatches */
  const colorChromeBtn =
    'm-0 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 transition-[color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--outline-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklab,var(--bg-elevated)_40%,transparent)] disabled:pointer-events-none disabled:opacity-[0.22]'

  /** Slightly finer rim than 1px so the circle reads smaller next to swatches */
  const plusRingIdle =
    'shadow-[inset_0_0_0_0.65px_color-mix(in_oklab,var(--ink)_30%,transparent)]'
  const plusRingHover =
    'hover:shadow-[inset_0_0_0_0.65px_color-mix(in_oklab,var(--ink)_44%,transparent)]'
  const plusRingOpen =
    'shadow-[inset_0_0_0_0.65px_color-mix(in_oklab,var(--ink)_55%,transparent)]'

  const pickerPopoverShellClass = cn(
    'rounded-[14px] bg-[color-mix(in_oklab,var(--bg-elevated)_72%,transparent)] p-3.5',
    'ring-1 ring-inset ring-white/[0.08]',
    'shadow-[0_24px_60px_-28px_rgba(0,0,0,0.75)] backdrop-blur-2xl backdrop-saturate-150',
  )

  const pickerPopoverBody = (
    <>
      <p className="mb-2 flex items-baseline gap-1.5 font-[family-name:var(--font-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[color-mix(in_oklab,var(--ink)_38%,transparent)]">
        <span>Tap swatch</span>
        <span className="font-[family-name:var(--font-vogue)] text-[0.78rem] font-normal italic normal-case tracking-normal text-[color-mix(in_oklab,var(--ink)_55%,transparent)]">
          to open color wheel
        </span>
      </p>

      <label
        className={cn(
          'group relative mb-3 block h-11 w-full cursor-pointer overflow-hidden rounded-[10px]',
          'ring-1 ring-inset ring-white/[0.06] transition-shadow duration-150',
          'hover:ring-white/[0.18]',
        )}
      >
        <div
          className="size-full"
          style={{
            backgroundColor: value ?? '#a8a8a8',
          }}
        />
        <input
          type="color"
          value={activeHex ?? colorWheelFallback}
          onChange={(e) => {
            onChange(e.target.value)
            setDraft(e.target.value.replace('#', ''))
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label="Open color wheel"
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center',
            'font-[family-name:var(--font-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.42em]',
            'text-white mix-blend-difference select-none',
          )}
        >
          Select
        </span>
      </label>

      <label
        className={cn(
          'flex w-full min-w-0 cursor-text items-center gap-1.5 rounded-[8px] py-2 pl-3 pr-2.5',
          'bg-[color-mix(in_oklab,var(--ink)_3.5%,transparent)] ring-1 ring-inset transition-[background,box-shadow] duration-150',
          'hover:bg-[color-mix(in_oklab,var(--ink)_5%,transparent)]',
          normalized
            ? 'ring-white/[0.08] focus-within:bg-white/10 focus-within:ring-[var(--ring-focus)]'
            : 'ring-[rgba(180,40,40,0.35)] focus-within:ring-[rgba(180,40,40,0.55)]',
        )}
      >
        <span className="font-[family-name:var(--font-sans)] text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_oklab,var(--ink)_34%,transparent)] select-none">
          Hex
        </span>
        <span className="font-mono text-[0.74rem] text-[color-mix(in_oklab,var(--ink)_32%,transparent)] select-none">
          #
        </span>
        <input
          value={draft}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
            setDraft(raw)
            const n = normalizeHex(raw)
            if (n) onChange(n)
          }}
          onBlur={() => {
            const n = normalizeHex(draft)
            if (!n)
              setDraft(
                value == null
                  ? ''
                  : (normalizeHex(value) ?? value).replace('#', ''),
              )
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setOpen(false)
          }}
          className={cn(
            'min-w-0 flex-1 bg-transparent font-mono text-[0.78rem] tracking-[0.08em]',
            'text-[color-mix(in_oklab,var(--ink)_82%,transparent)] caret-[color-mix(in_oklab,var(--ink)_78%,transparent)] outline-none',
            'placeholder:text-[color-mix(in_oklab,var(--ink)_24%,transparent)]',
          )}
          maxLength={6}
          spellCheck={false}
          placeholder="rrggbb"
          inputMode="text"
        />
      </label>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!normalized || alreadySaved}
          onClick={() => {
            if (normalized) onAddColor(normalized)
          }}
          className={cn(
            'font-[family-name:var(--font-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.16em] transition-colors duration-150',
            normalized && !alreadySaved
              ? 'text-[color-mix(in_oklab,var(--ink)_50%,transparent)] hover:text-[color-mix(in_oklab,var(--ink)_82%,transparent)]'
              : 'cursor-default text-[color-mix(in_oklab,var(--ink)_22%,transparent)]',
          )}
        >
          {alreadySaved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-[family-name:var(--font-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[color-mix(in_oklab,var(--ink)_50%,transparent)] transition-colors duration-150 hover:text-[color-mix(in_oklab,var(--ink)_82%,transparent)]"
        >
          Done
        </button>
      </div>
    </>
  )

  return (
    <div className="relative flex flex-col gap-2.5" ref={panelRef}>

      <div className="flex w-full min-w-0 flex-wrap items-center gap-[10px] [&>button]:m-0">
        {COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            onClick={() => onChange(c.hex)}
            className={cn(
              'm-0 size-[18px] shrink-0 cursor-pointer rounded-full transition-shadow duration-150 focus-visible:outline-none',
              swatchRing(
                activeHex !== null && activeHex === c.hex.toLowerCase(),
              ),
            )}
            style={{ backgroundColor: c.hex }}
          />
        ))}

        {extraColors.map((hex) => (
          <button
            key={hex}
            type="button"
            title={hex}
            onClick={() => onChange(hex)}
            className={cn(
              'm-0 size-[18px] shrink-0 cursor-pointer rounded-full transition-shadow duration-150 focus-visible:outline-none',
              swatchRing(
                activeHex !== null && activeHex === hex.toLowerCase(),
              ),
            )}
            style={{ backgroundColor: hex }}
          />
        ))}

        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPicker())}
          aria-label="Custom color"
          aria-expanded={open}
          className={cn(
            colorChromeBtn,
            open ? plusRingOpen : cn(plusRingIdle, plusRingHover),
            'text-[color-mix(in_oklab,var(--ink)_50%,transparent)]',
            'hover:text-[color-mix(in_oklab,var(--ink)_82%,transparent)]',
            open &&
              'text-[color-mix(in_oklab,var(--ink)_90%,transparent)]',
          )}
        >
          <Plus className="size-3.5" strokeWidth={2} aria-hidden />
        </button>

        {onResetToModel && (
          <button
            type="button"
            title={resetControlTitle}
            aria-label={resetControlAriaLabel}
            disabled={value === null}
            onClick={onResetToModel}
            className={cn(
              colorChromeBtn,
              'text-[color-mix(in_oklab,var(--ink)_46%,transparent)]',
              'hover:text-[color-mix(in_oklab,var(--ink)_80%,transparent)]',
            )}
          >
            <RotateCcw className="size-3.5" strokeWidth={1.85} aria-hidden />
          </button>
        )}
      </div>

      {/* Subtle caption — vogue italic + mono hex */}
      <p className="m-0 flex items-baseline gap-2 font-[family-name:var(--font-sans)] text-[0.72rem] text-[color-mix(in_oklab,var(--ink)_42%,transparent)]">
        <span className="font-[family-name:var(--font-vogue)] italic text-[color-mix(in_oklab,var(--ink)_72%,transparent)]">
          {activeName}
        </span>
        <span className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-[color-mix(in_oklab,var(--ink)_34%,transparent)]">
          {activeHex ?? '—'}
        </span>
      </p>

      {/* Picker popover — portal on stacked studio so `fixed` is viewport-anchored (Motion `transform` breaks in-tree fixed + WebGL stacks on top) */}
      {typeof document !== 'undefined' &&
        open &&
        preferPopoverAbove &&
        fixedPopoverLayout &&
        createPortal(
          <motion.div
            ref={popoverRef}
            role="dialog"
            aria-label="Custom color"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={fixedPopoverLayout}
            className={pickerPopoverShellClass}
          >
            {pickerPopoverBody}
          </motion.div>,
          document.body,
        )}

      <AnimatePresence>
        {open && !preferPopoverAbove && (
          <motion.div
            ref={popoverRef}
            role="dialog"
            aria-label="Custom color"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'absolute left-0 right-0 top-[calc(100%+10px)] z-50',
              'max-h-[min(22rem,calc(100dvh-6rem-env(safe-area-inset-bottom,0px)))] overflow-y-auto overscroll-contain',
              pickerPopoverShellClass,
            )}
          >
            {pickerPopoverBody}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PatternFieldReset({
  ariaLabel,
  atDefault,
  onClick,
}: {
  ariaLabel: string
  atDefault: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title="Original"
      disabled={atDefault}
      onClick={onClick}
      className={patternFieldResetBtnClass}
    >
      <RotateCcw className="size-3.5" strokeWidth={2} aria-hidden />
    </button>
  )
}

function PatternMapControls({
  value,
  onPatch,
  onReset,
}: {
  value: PatternMapSettings
  onPatch: (patch: Partial<PatternMapSettings>) => void
  onReset: () => void
}) {
  const isDefault =
    value.offsetU === DEFAULT_PATTERN_MAP.offsetU &&
    value.offsetV === DEFAULT_PATTERN_MAP.offsetV &&
    value.repeatU === DEFAULT_PATTERN_MAP.repeatU &&
    value.repeatV === DEFAULT_PATTERN_MAP.repeatV &&
    value.patternScale === DEFAULT_PATTERN_MAP.patternScale &&
    value.invert === DEFAULT_PATTERN_MAP.invert &&
    value.invertV === DEFAULT_PATTERN_MAP.invertV

  const chipBase =
    'rounded-md px-2 py-1.5 font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold uppercase tracking-[0.1em] ring-1 ring-inset transition-colors duration-150'
  const chipIdle =
    'bg-transparent text-[color-mix(in_oklab,var(--ink)_45%,transparent)] ring-white/[0.1] hover:bg-white/[0.04] hover:text-[color-mix(in_oklab,var(--ink)_72%,transparent)]'
  const chipOn =
    'bg-white/[0.08] text-[color-mix(in_oklab,var(--ink)_88%,transparent)] ring-white/[0.18]'

  const stepBtn =
    'flex size-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[color-mix(in_oklab,var(--ink)_36%,transparent)] transition-colors duration-150 hover:text-[color-mix(in_oklab,var(--ink)_78%,transparent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/15 disabled:pointer-events-none disabled:opacity-[0.22]'

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
  const OFFSET_STEP = 0.01
  const SCALE_STEP = 0.02

  const rowLabel =
    'font-[family-name:var(--font-sans)] text-[0.72rem] text-[color-mix(in_oklab,var(--ink)_45%,transparent)]'

  /** Same width as value / reset column so “Original” lines up with numeric rows + slider +/- below */
  const patternControlValueCol = 'flex min-w-[6rem] shrink-0 justify-end'

  return (
    <div className="flex flex-col gap-3.5 rounded-[10px] bg-white/[0.02] px-3 py-3 ring-1 ring-inset ring-white/[0.06]">
      <div className="flex w-full min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <span className="font-[family-name:var(--font-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--ink)_38%,transparent)]">
            On model
          </span>
          <span className="size-8 shrink-0" aria-hidden />
        </div>
        <div className={patternControlValueCol}>
          <button
            type="button"
            disabled={isDefault}
            onClick={onReset}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-[family-name:var(--font-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.12em] transition-colors duration-150',
              isDefault
                ? 'cursor-default text-[color-mix(in_oklab,var(--ink)_22%,transparent)]'
                : 'text-[color-mix(in_oklab,var(--ink)_48%,transparent)] hover:bg-white/[0.05] hover:text-[color-mix(in_oklab,var(--ink)_78%,transparent)]',
            )}
          >
            <RotateCcw className="size-3" strokeWidth={2} aria-hidden />
            Original
          </button>
        </div>
      </div>

      {/* Shift ↔ */}
      <div className="flex flex-col gap-1.5">
        <div className="flex w-full min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            <span className={rowLabel}>Shift ↔</span>
            <PatternFieldReset
              ariaLabel="Reset shift horizontal to original"
              atDefault={value.offsetU === DEFAULT_PATTERN_MAP.offsetU}
              onClick={() => onPatch({ offsetU: DEFAULT_PATTERN_MAP.offsetU })}
            />
          </div>
          <div className={patternControlValueCol}>
            <span className="font-mono text-[0.7rem] tabular-nums text-[color-mix(in_oklab,var(--ink)_40%,transparent)]">
              {value.offsetU.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Shift horizontal minus"
            className={stepBtn}
            disabled={value.offsetU <= -1 + 1e-6}
            onClick={() =>
              onPatch({ offsetU: clamp(value.offsetU - OFFSET_STEP, -1, 1) })
            }
          >
            <Minus className="size-3.5" strokeWidth={2} aria-hidden />
          </button>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.005}
            value={value.offsetU}
            onChange={(e) => onPatch({ offsetU: parseFloat(e.target.value) })}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[color-mix(in_oklab,var(--ink)_55%,transparent)]"
          />
          <button
            type="button"
            aria-label="Shift horizontal plus"
            className={stepBtn}
            disabled={value.offsetU >= 1 - 1e-6}
            onClick={() =>
              onPatch({ offsetU: clamp(value.offsetU + OFFSET_STEP, -1, 1) })
            }
          >
            <Plus className="size-3.5" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {/* Shift ↕ */}
      <div className="flex flex-col gap-1.5">
        <div className="flex w-full min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            <span className={rowLabel}>Shift ↕</span>
            <PatternFieldReset
              ariaLabel="Reset shift vertical to original"
              atDefault={value.offsetV === DEFAULT_PATTERN_MAP.offsetV}
              onClick={() => onPatch({ offsetV: DEFAULT_PATTERN_MAP.offsetV })}
            />
          </div>
          <div className={patternControlValueCol}>
            <span className="font-mono text-[0.7rem] tabular-nums text-[color-mix(in_oklab,var(--ink)_40%,transparent)]">
              {value.offsetV.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Shift vertical minus"
            className={stepBtn}
            disabled={value.offsetV <= -1 + 1e-6}
            onClick={() =>
              onPatch({ offsetV: clamp(value.offsetV - OFFSET_STEP, -1, 1) })
            }
          >
            <Minus className="size-3.5" strokeWidth={2} aria-hidden />
          </button>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.005}
            value={value.offsetV}
            onChange={(e) => onPatch({ offsetV: parseFloat(e.target.value) })}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[color-mix(in_oklab,var(--ink)_55%,transparent)]"
          />
          <button
            type="button"
            aria-label="Shift vertical plus"
            className={stepBtn}
            disabled={value.offsetV >= 1 - 1e-6}
            onClick={() =>
              onPatch({ offsetV: clamp(value.offsetV + OFFSET_STEP, -1, 1) })
            }
          >
            <Plus className="size-3.5" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {/* Repeat */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-0.5">
          <span className={rowLabel}>Repeat</span>
          <PatternFieldReset
            ariaLabel="Reset repeat to original (1×1)"
            atDefault={
              value.repeatU === DEFAULT_PATTERN_MAP.repeatU &&
              value.repeatV === DEFAULT_PATTERN_MAP.repeatV
            }
            onClick={() =>
              onPatch({
                repeatU: DEFAULT_PATTERN_MAP.repeatU,
                repeatV: DEFAULT_PATTERN_MAP.repeatV,
              })
            }
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([1, 2, 3, 4, 6] as const).map((n) => {
            const on = value.repeatU === n && value.repeatV === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => onPatch({ repeatU: n, repeatV: n })}
                className={cn(chipBase, on ? chipOn : chipIdle)}
              >
                {n}×{n}
              </button>
            )
          })}
        </div>
      </div>

      {/* Print size */}
      <div className="flex flex-col gap-1.5">
        <div className="flex w-full min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            <span className={rowLabel}>Print size</span>
            <PatternFieldReset
              ariaLabel="Reset print size to original"
              atDefault={
                value.patternScale === DEFAULT_PATTERN_MAP.patternScale
              }
              onClick={() =>
                onPatch({ patternScale: DEFAULT_PATTERN_MAP.patternScale })
              }
            />
          </div>
          <div className={patternControlValueCol}>
            <span className="font-mono text-[0.7rem] tabular-nums tracking-[0.06em] text-[color-mix(in_oklab,var(--ink)_42%,transparent)]">
              {value.patternScale.toFixed(2)}×
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease print size scale"
            className={stepBtn}
            disabled={value.patternScale <= 0.25 + 1e-6}
            onClick={() =>
              onPatch({
                patternScale: clamp(value.patternScale - SCALE_STEP, 0.25, 4),
              })
            }
          >
            <Minus className="size-3.5" strokeWidth={2} aria-hidden />
          </button>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.02}
            value={value.patternScale}
            onChange={(e) =>
              onPatch({ patternScale: parseFloat(e.target.value) })
            }
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[color-mix(in_oklab,var(--ink)_55%,transparent)]"
          />
          <button
            type="button"
            aria-label="Increase print size scale"
            className={stepBtn}
            disabled={value.patternScale >= 4 - 1e-6}
            onClick={() =>
              onPatch({
                patternScale: clamp(value.patternScale + SCALE_STEP, 0.25, 4),
              })
            }
          >
            <Plus className="size-3.5" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="flex justify-between font-[family-name:var(--font-sans)] text-[0.64rem] text-[color-mix(in_oklab,var(--ink)_36%,transparent)]">
          <span>Larger</span>
          <span>Smaller</span>
        </div>
      </div>

      {/* Flip horizontal / vertical */}
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-0.5">
            <span className={rowLabel}>Flip ↔</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={value.invert}
            aria-label="Flip pattern horizontally"
            onClick={() => onPatch({ invert: !value.invert })}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left ring-1 ring-inset ring-white/[0.08] transition-colors duration-150',
              value.invert
                ? 'bg-white/[0.07]'
                : 'bg-transparent hover:bg-white/[0.03]',
            )}
          >
            <span className="font-[family-name:var(--font-sans)] text-[0.82rem] font-medium text-[color-mix(in_oklab,var(--ink)_76%,transparent)]">
              {value.invert ? 'Mirrored' : 'Normal'}
            </span>
            <span
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
                value.invert ? 'bg-[color-mix(in_oklab,var(--ink)_55%,transparent)]' : 'bg-white/[0.12]',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-[var(--ink)] shadow-sm transition-transform duration-200',
                  value.invert ? 'left-4' : 'left-0.5',
                )}
              />
            </span>
          </button>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-0.5">
            <span className={rowLabel}>Flip ↕</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={value.invertV}
            aria-label="Flip pattern vertically"
            onClick={() => onPatch({ invertV: !value.invertV })}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left ring-1 ring-inset ring-white/[0.08] transition-colors duration-150',
              value.invertV
                ? 'bg-white/[0.07]'
                : 'bg-transparent hover:bg-white/[0.03]',
            )}
          >
            <span className="font-[family-name:var(--font-sans)] text-[0.82rem] font-medium text-[color-mix(in_oklab,var(--ink)_76%,transparent)]">
              {value.invertV ? 'Mirrored' : 'Normal'}
            </span>
            <span
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
                value.invertV ? 'bg-[color-mix(in_oklab,var(--ink)_55%,transparent)]' : 'bg-white/[0.12]',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-[var(--ink)] shadow-sm transition-transform duration-200',
                  value.invertV ? 'left-4' : 'left-0.5',
                )}
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function UploadZone({
  patternName,
  onPick,
  onClear,
}: {
  patternName: string | null
  onPick: (file: File) => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-white/[0.12] px-3 py-4 text-center',
          'transition-[border-color,background-color] duration-200 hover:border-white/22 hover:bg-white/[0.03]',
        )}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            onPick(f)
            // allow picking the same file twice
            e.currentTarget.value = ''
          }}
        />
        <span className="text-[1.25rem] leading-none text-[color-mix(in_oklab,var(--ink)_42%,transparent)]">↑</span>
        <span className="font-[family-name:var(--font-sans)] text-[0.88rem] font-medium text-[color-mix(in_oklab,var(--ink)_82%,transparent)]">
          Upload pattern
        </span>
        <span className="font-[family-name:var(--font-sans)] text-[0.78rem] text-[color-mix(in_oklab,var(--ink)_52%,transparent)]">
          PNG · JPG · WEBP
        </span>
      </label>

      {patternName && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] bg-white/[0.03] px-3 py-2 ring-1 ring-inset ring-white/[0.06]">
          <span className="min-w-0 truncate font-[family-name:var(--font-sans)] text-[0.8rem] text-[color-mix(in_oklab,var(--ink)_62%,transparent)]">
            {patternName}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-full bg-white/[0.04] px-2.5 py-1 font-[family-name:var(--font-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[color-mix(in_oklab,var(--ink)_52%,transparent)] ring-1 ring-inset ring-white/[0.08] transition-colors duration-150 hover:bg-white/[0.07] hover:text-[color-mix(in_oklab,var(--ink)_82%,transparent)]"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

function CtaButton({
  busy,
  disabled,
  onClick,
}: {
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        ctaHero,
        (disabled || busy) && 'cursor-not-allowed opacity-[0.52]',
      )}
    >
      {busy ? 'Adding…' : 'Add to Cart →'}
    </button>
  )
}
/** Studio hero captions — `withTopRule` false when the strip sits under the canvas (stacked layout). */
function StudioViewerCaptionFooter({
  viewerLight,
  withTopRule,
  gender,
  label,
}: {
  viewerLight: boolean
  withTopRule: boolean
  gender: string
  label: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.45, ease }}
      className={cn(
        'w-full',
        withTopRule && 'border-t pt-5',
        viewerLight ? 'border-black/[0.08]' : 'border-white/10',
      )}
    >
      <p
        className={cn(
          'mb-2 font-[family-name:var(--font-sans)] text-[0.66rem] font-semibold uppercase tracking-[0.16em]',
          viewerLight ? 'text-[var(--studio-on-light-soft)]' : 'text-white/40',
        )}
      >
        Upload · Preview · Order
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded px-2 py-0.5 font-[family-name:var(--font-sans)] text-[0.58rem] font-semibold uppercase tracking-[0.14em]',
              viewerLight
                ? 'bg-[color-mix(in_oklab,var(--studio-on-light-fg)_10%,transparent)] text-[color-mix(in_oklab,var(--studio-on-light-fg)_72%,transparent)]'
                : 'bg-white/[0.1] text-white/[0.75]',
            )}
          >
            {gender}
          </span>
          <span
            className={cn(
              'min-w-0 text-[clamp(1.2rem,3.5vw,1.5rem)] leading-tight',
              viewerLight ? titleOnLightCanvas : titleOnDark,
            )}
          >
            {label}
          </span>
        </div>
        <p
          className={cn(
            'm-0 max-w-[16rem] font-[family-name:var(--font-vogue)] text-[0.8rem] font-light italic leading-snug tracking-[0.04em]',
            viewerLight ? 'text-[var(--studio-on-light-muted)]' : 'text-white/45',
          )}
        >
          Drag the model to inspect fabric and drape.
        </p>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────

export function DesignPage() {
  const { user, ready } = useAuth()
  const [gender, setGender]     = useState<Gender>('male')
  const [selected, setSelected] = useState<GarmentEntry | null>(null)
  const [studioSize, setStudioSize] = useState<GarmentSize>('M')
  const [cartBusy, setCartBusy] = useState(false)
  const [cartHint, setCartHint] = useState<string | null>(null)
  const [studioZoom, setStudioZoom] = useState(1)
  const [studioViewerLight, setStudioViewerLight] = useState(false)
  const [designByGarmentId, setDesignByGarmentId] = useState<
    Partial<Record<GarmentEntry['id'], Partial<GarmentDesignState>>>
  >({})
  const designByGarmentRef = useRef(designByGarmentId)
  useLayoutEffect(() => {
    designByGarmentRef.current = designByGarmentId
  }, [designByGarmentId])
  /** Below this width: studio stacks (viewer above panel); side‑by‑side at `lg` and up */
  const studioCompact = useIsNarrow(1024)
  /** Phone-width: taller viewer chrome; GLB framing uses `studioCompact` so tablets stack too */
  const studioPhone = useIsNarrow(640)
  const { setSuppressFooter } = useFooterChrome()

  useEffect(() => {
    setSuppressFooter(!!selected)
    return () => setSuppressFooter(false)
  }, [selected, setSuppressFooter])

  useEffect(() => {
    return () => {
      for (const partial of Object.values(designByGarmentRef.current)) {
        const url = partial?.patternUrl
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [])

  const selectGarment = (g: GarmentEntry) => {
    setStudioZoom(1)
    setStudioSize('M')
    setCartHint(null)
    setSelected(g)
  }

  const handleAddToCart = async () => {
    if (!selected) return
    if (!ready) return
    if (!user || !canAccessApp(user)) {
      setCartHint('Sign in with a verified email to add items to your cart.')
      return
    }
    setCartBusy(true)
    setCartHint(null)
    try {
      const cat = getGarmentCatalog(selected.id)
      const merged = mergeGarmentDesign(designByGarmentId[selected.id])
      const variant = buildVariantLabel(
        studioSize,
        merged,
        isMaleCollarSelected,
        isMaleTshirtSelected,
      )
      const designKey = stableDesignKey(merged, {
        collarLocked: isMaleCollarSelected,
        isTshirt: isMaleTshirtSelected,
      })
      await addOrIncrementCartLine(user.uid, {
        garmentId: selected.id,
        title: selected.label,
        size: studioSize,
        unitPrice: cat.price,
        variant,
        glbPath: selected.path,
        sku: cat.sku,
        colorHex: isMaleCollarSelected ? null : merged.color,
        buttonColorHex: isMaleTshirtSelected ? merged.buttonColor : null,
        patternName: merged.patternName,
        patternMap: patternMapToCart(merged.patternMap),
        designKey,
      })
      setCartHint('Added to your bag.')
    } catch {
      setCartHint('Could not update your cart. Try again.')
    } finally {
      setCartBusy(false)
    }
  }

  const visible = GARMENTS.filter((g) => g.gender === gender)
  const isMaleCollarSelected =
    selected != null && isCollarButtonDownPath(selected.path)
  const isMaleTshirtSelected = selected?.path === MODELS.male.tshirt
  const studioDesign = mergeGarmentDesign(
    selected ? designByGarmentId[selected.id] : undefined,
  )
  const studioAtMin = studioZoom <= STUDIO_ZOOM_MIN * 1.001
  const studioAtMax = studioZoom >= STUDIO_ZOOM_MAX * 0.999
  const studioAtDefault = Math.abs(studioZoom - 1) < 0.005
  const studioZoomChrome = cn(
    studioZoomBtnBase,
    studioViewerLight ? studioZoomChromeLight : studioZoomChromeDark,
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent font-[family-name:var(--font-sans)] text-[color-mix(in_oklab,var(--ink)_52%,transparent)]">
      <AnimatePresence mode="wait">

        {!selected && (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3, ease }}
            className="flex min-h-0 flex-1 flex-col gap-[clamp(1.5rem,3.5vw,2.25rem)] overflow-y-auto px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.25rem,3.5vw,2.75rem)] md:gap-9"
          >

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease, delay: 0.05 }}
              className="text-center"
            >
              <p className="mb-1.5 font-[family-name:var(--font-sans)] text-[0.82rem] font-semibold uppercase tracking-[0.16em] text-[color-mix(in_oklab,var(--ink)_42%,transparent)]">
                Custom Apparel Studio — 2026
              </p>
              <h1
                className={cn(
                  'mb-1.5 text-[clamp(1.65rem,3.5vw,2.85rem)] leading-tight',
                  titleHero,
                )}
              >
                Choose your garment
              </h1>
              <p className="m-0 font-[family-name:var(--font-vogue)] text-[clamp(1.05rem,2vw,1.35rem)] font-light italic leading-snug tracking-[0.06em] text-[color-mix(in_oklab,var(--ink)_52%,transparent)]">
                Select a model — it opens into the design studio.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease, delay: 0.15 }}
              className="mx-auto flex w-full max-w-[56rem] justify-center gap-10 border-b border-white/[0.08] pb-0"
            >
              {(['male', 'female'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={cn(
                    'relative cursor-pointer border-none bg-transparent pb-2 font-[family-name:var(--font-sans)] text-[0.78rem] font-semibold uppercase tracking-[0.18em] transition-colors duration-200',
                    gender === g ? navActive : cn(navMuted, 'hover:text-[color-mix(in_oklab,var(--ink)_78%,transparent)]'),
                  )}
                >
                  {g === 'male' ? 'Male' : 'Female'}
                  {gender === g && (
                    <motion.span
                      layoutId="tab-line"
                      transition={{ type: 'spring', bounce: 0.22, duration: 0.4 }}
                      className="absolute -bottom-px left-0 right-0 block h-0.5 rounded-t-sm bg-[color-mix(in_oklab,var(--ink)_82%,transparent)]"
                    />
                  )}
                </button>
              ))}
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div
                key={gender}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="mx-auto grid w-full max-w-[min(56rem,100%)] grid-cols-1 gap-[clamp(0.75rem,2.2vw,1.25rem)] pb-4 min-[400px]:grid-cols-2 min-[400px]:gap-4 xl:grid-cols-3 xl:gap-x-5 xl:gap-y-6"
              >
                {visible.map((g, i) => (
                  <GarmentCard
                    key={g.id}
                    garment={g}
                    index={i}
                    design={mergeGarmentDesign(designByGarmentId[g.id])}
                    onSelect={() => selectGarment(g)}
                  />
                ))}
              </motion.div>
            </AnimatePresence>

          </motion.div>
        )}

        {selected && (
          <motion.div
            key="studio"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease }}
            className={cn(
              'flex min-h-0 flex-1 text-[color-mix(in_oklab,var(--ink)_52%,transparent)]',
              'flex-col lg:flex-row',
              'max-h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom,0px))]',
              studioCompact
                ? 'overflow-y-auto overscroll-contain pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]'
                : 'overflow-hidden',
            )}
          >

            <motion.div
              initial={{ opacity: 0, x: studioCompact ? 0 : -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease, delay: 0.05 }}
              className={cn(
                'relative min-h-0 min-w-0 flex-1 overflow-hidden transition-[background-color] duration-300 ease-out',
                studioCompact && 'z-0',
                studioViewerLight
                  ? 'bg-[var(--studio-light-bg)]'
                  : 'bg-[var(--studio-dark-surface)] backdrop-blur-[14px] backdrop-saturate-[125%]',
                studioCompact &&
                  (studioPhone
                    ? 'min-h-[min(60svh,max(46svh,calc(100dvh-4.5rem-12rem-env(safe-area-inset-bottom,0px))))]'
                    : 'min-h-[min(52svh,max(38svh,calc(100dvh-4.5rem-14rem-env(safe-area-inset-bottom,0px))))]'),
                'lg:min-h-0',
                studioCompact && 'flex flex-col',
              )}
              style={
                studioViewerLight
                  ? undefined
                  : { WebkitBackdropFilter: 'blur(14px) saturate(1.25)' }
              }
            >
              <div
                className={cn(
                  'min-h-0 touch-none overscroll-contain',
                  studioCompact
                    ? 'relative min-h-0 flex-1'
                    : 'absolute inset-0',
                )}
              >
                {/*
                  Stacked layout: `flex-1` + child `h-full` often collapses the WebGL canvas height
                  on mobile; `absolute inset-0` ties the canvas layer to the stage’s real box.
                  Desktop keeps the previous direct child (inset-0 parent already defines height).
                */}
                <div
                  className={cn(
                    'min-h-0',
                    studioCompact ? 'absolute inset-0 z-0' : 'contents',
                  )}
                >
                  <GarmentCanvas
                    key={selected.path}
                    path={selected.path}
                    compact={false}
                    studioMobile={studioCompact}
                    studioZoom={studioZoom}
                    setStudioZoom={setStudioZoom}
                    viewerLight={studioViewerLight}
                    tintHex={
                      isMaleCollarSelected
                        ? undefined
                        : (studioDesign.color ?? undefined)
                    }
                    buttonTintHex={
                      isMaleTshirtSelected
                        ? (studioDesign.buttonColor ?? undefined)
                        : undefined
                    }
                    patternUrl={studioDesign.patternUrl}
                    patternMap={studioDesign.patternMap}
                  />
                </div>

                <StudioViewerThemeToggle
                  viewerLight={studioViewerLight}
                  onViewerLightChange={setStudioViewerLight}
                  className="pointer-events-auto absolute right-[clamp(1rem,3vw,2rem)] top-[clamp(1.25rem,3vw,2rem)] z-20 md:right-8 md:top-8"
                />

                <div
                  className={cn(
                    'pointer-events-auto absolute right-[clamp(1rem,3vw,2rem)] z-20 flex items-center gap-1.5',
                    studioCompact
                      ? 'bottom-[clamp(1rem,4vh,1.75rem)]'
                      : 'bottom-[clamp(5.5rem,14vh,8rem)] lg:bottom-[clamp(6rem,12vh,9rem)] lg:right-[clamp(1.25rem,2.5vw,2rem)]',
                  )}
                  role="group"
                  aria-label="Model size"
                >
                  <button
                    type="button"
                    aria-label="Decrease model size"
                    disabled={studioAtMin}
                    onClick={() =>
                      setStudioZoom((z) =>
                        Math.max(
                          STUDIO_ZOOM_MIN,
                          z / STUDIO_ZOOM_STEP_FACTOR,
                        ),
                      )
                    }
                    className={studioZoomChrome}
                  >
                    <Minus className="size-3.5" strokeWidth={1.85} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Reset model size"
                    disabled={studioAtDefault}
                    onClick={() => setStudioZoom(1)}
                    className={studioZoomChrome}
                  >
                    <RotateCcw className="size-3.5" strokeWidth={1.85} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Increase model size"
                    disabled={studioAtMax}
                    onClick={() =>
                      setStudioZoom((z) =>
                        Math.min(
                          STUDIO_ZOOM_MAX,
                          z * STUDIO_ZOOM_STEP_FACTOR,
                        ),
                      )
                    }
                    className={studioZoomChrome}
                  >
                    <Plus className="size-3.5" strokeWidth={1.85} aria-hidden />
                  </button>
                </div>

                {/*
                  Avoid a full `inset-0` overlay: on mobile Safari it can steal hit-testing
                  below the top chrome so OrbitControls only receive touches in a band.
                  Position controls in small absolute regions instead.
                */}
                <motion.button
                  type="button"
                  onClick={() => setSelected(null)}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4, ease }}
                  className={cn(
                    'pointer-events-auto absolute left-[clamp(1rem,3vw,2rem)] top-[clamp(1.25rem,3vw,1.75rem)] z-20 md:left-8 md:top-7',
                    studioViewerLight ? controlOnLightCanvas : controlOnDark,
                  )}
                >
                  ← All Garments
                </motion.button>

                {!studioCompact && (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-[clamp(1rem,3vw,2rem)] pb-[clamp(1rem,2.5vw,1.75rem)] pt-0 md:px-8 md:pb-8"
                  >
                    <StudioViewerCaptionFooter
                      viewerLight={studioViewerLight}
                      withTopRule
                      gender={selected.gender}
                      label={selected.label}
                    />
                  </div>
                )}
              </div>

              {studioCompact && (
                <div
                  className={cn(
                    'shrink-0 border-t px-[clamp(1rem,3vw,2rem)] py-3 pb-[clamp(0.75rem,2.5vw,1.25rem)] pt-[clamp(0.85rem,2.5vw,1.1rem)] md:px-8',
                    studioViewerLight
                      ? 'border-[color-mix(in_oklab,var(--studio-on-light-fg)_10%,transparent)]'
                      : 'border-white/10',
                  )}
                >
                  <StudioViewerCaptionFooter
                    viewerLight={studioViewerLight}
                    withTopRule={false}
                    gender={selected.gender}
                    label={selected.label}
                  />
                </div>
              )}
            </motion.div>

            <motion.aside
              initial={{ x: studioCompact ? 0 : 48, y: studioCompact ? 24 : 0, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease, delay: 0.18 }}
              className={cn(
                'flex w-full shrink-0 flex-col border-white/[0.08]',
                'bg-[color-mix(in_oklab,var(--bg-elevated)_52%,transparent)] backdrop-blur-xl backdrop-saturate-150',
                studioCompact
                  ? 'relative z-30 min-h-0 overflow-visible border-t'
                  : cn(
                      'min-h-0 max-h-[min(50dvh,26rem)] overflow-hidden border-t',
                      'lg:max-h-full lg:w-[min(22rem,34vw)] lg:shrink-0 lg:border-l lg:border-t-0',
                    ),
              )}
            >
              <div
                className={cn(
                  'flex flex-col gap-[clamp(1rem,2.5vw,1.35rem)] px-[clamp(1rem,3vw,1.35rem)] py-[clamp(1rem,2.5vw,1.5rem)] md:px-5 md:py-6',
                  studioCompact
                    ? 'min-h-0'
                    : 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
                )}
              >

                <div className="hidden border-b border-white/[0.07] pb-3 lg:block">
                  <p className={cn('mb-0.5', barTag)}>Studio</p>
                  <h2
                    className={cn(
                      'm-0 text-[clamp(1.1rem,2vw,1.35rem)] leading-snug',
                      titleHero,
                    )}
                  >
                    {selected.label}
                  </h2>
                </div>

                <PanelSection label="Fabric Color">
                  {isMaleCollarSelected ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative inline-flex items-center gap-2">
                        <div
                          className="relative size-7 shrink-0 rounded-full bg-[color-mix(in_oklab,var(--ink)_8%,transparent)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
                          aria-hidden
                        >
                          <div className="absolute left-1/2 top-1/2 h-[2px] w-[34px] -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] rounded-full bg-[color-mix(in_oklab,var(--ink)_55%,transparent)]" />
                        </div>
                        <span className="font-[family-name:var(--font-sans)] text-[0.78rem] font-medium text-[color-mix(in_oklab,var(--ink)_52%,transparent)]">
                          Not available
                        </span>
                      </div>
                      <span className="font-[family-name:var(--font-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--ink)_28%,transparent)]">
                        Locked
                      </span>
                    </div>
                  ) : (
                    <FabricColorPicker
                      value={studioDesign.color}
                      preferPopoverAbove={studioCompact}
                      onChange={(hex) => {
                        if (!selected) return
                        setDesignByGarmentId((prev) => ({
                          ...prev,
                          [selected.id]: { ...prev[selected.id], color: hex },
                        }))
                      }}
                      onResetToModel={() => {
                        if (!selected) return
                        setDesignByGarmentId((prev) => ({
                          ...prev,
                          [selected.id]: { ...prev[selected.id], color: null },
                        }))
                      }}
                      extraColors={studioDesign.extraColors}
                      onAddColor={(hex) => {
                        if (!selected) return
                        setDesignByGarmentId((prev) => {
                          const merged = mergeGarmentDesign(prev[selected.id])
                          const next = merged.extraColors.includes(hex)
                            ? merged.extraColors
                            : [...merged.extraColors, hex]
                          return {
                            ...prev,
                            [selected.id]: { ...prev[selected.id], extraColors: next },
                          }
                        })
                      }}
                    />
                  )}
                </PanelSection>

                {isMaleTshirtSelected && (
                  <PanelSection label="Button Color">
                    <FabricColorPicker
                      value={studioDesign.buttonColor}
                      preferPopoverAbove={studioCompact}
                      onChange={(hex) => {
                        if (!selected) return
                        setDesignByGarmentId((prev) => ({
                          ...prev,
                          [selected.id]: { ...prev[selected.id], buttonColor: hex },
                        }))
                      }}
                      onResetToModel={() => {
                        if (!selected) return
                        setDesignByGarmentId((prev) => ({
                          ...prev,
                          [selected.id]: { ...prev[selected.id], buttonColor: null },
                        }))
                      }}
                      resetControlTitle="Original button color"
                      resetControlAriaLabel="Restore original model button color"
                      originalValueCaption="Original buttons"
                      extraColors={studioDesign.extraButtonColors}
                      onAddColor={(hex) => {
                        if (!selected) return
                        setDesignByGarmentId((prev) => {
                          const merged = mergeGarmentDesign(prev[selected.id])
                          const next = merged.extraButtonColors.includes(hex)
                            ? merged.extraButtonColors
                            : [...merged.extraButtonColors, hex]
                          return {
                            ...prev,
                            [selected.id]: {
                              ...prev[selected.id],
                              extraButtonColors: next,
                            },
                          }
                        })
                      }}
                    />
                  </PanelSection>
                )}

                <PanelSection label="Size">
                  <div
                    className="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-label="Garment size"
                  >
                    {GARMENT_SIZES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={studioSize === s}
                        onClick={() => setStudioSize(s)}
                        className={cn(
                          studioSelChipBase,
                          studioSize === s ? studioSelChipOn : studioSelChipIdle,
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </PanelSection>

                <PanelSection label="Upload Pattern">
                  <UploadZone
                    patternName={studioDesign.patternName}
                    onPick={(file) => {
                      if (!selected) return
                      setDesignByGarmentId((prev) => {
                        const prevUrl = mergeGarmentDesign(prev[selected.id]).patternUrl
                        if (prevUrl) URL.revokeObjectURL(prevUrl)
                        const url = URL.createObjectURL(file)
                        return {
                          ...prev,
                          [selected.id]: {
                            ...prev[selected.id],
                            patternUrl: url,
                            patternName: file.name,
                            patternMap: { ...DEFAULT_PATTERN_MAP },
                          },
                        }
                      })
                    }}
                    onClear={() => {
                      if (!selected) return
                      setDesignByGarmentId((prev) => {
                        const prevUrl = mergeGarmentDesign(prev[selected.id]).patternUrl
                        if (prevUrl) URL.revokeObjectURL(prevUrl)
                        return {
                          ...prev,
                          [selected.id]: {
                            ...prev[selected.id],
                            patternUrl: null,
                            patternName: null,
                            patternMap: { ...DEFAULT_PATTERN_MAP },
                          },
                        }
                      })
                    }}
                  />
                  {studioDesign.patternUrl && selected && (
                    <PatternMapControls
                      value={studioDesign.patternMap}
                      onPatch={(patch) => {
                        setDesignByGarmentId((prev) => {
                          const cur = mergeGarmentDesign(prev[selected.id]).patternMap
                          return {
                            ...prev,
                            [selected.id]: {
                              ...prev[selected.id],
                              patternMap: { ...cur, ...patch },
                            },
                          }
                        })
                      }}
                      onReset={() => {
                        setDesignByGarmentId((prev) => ({
                          ...prev,
                          [selected.id]: {
                            ...prev[selected.id],
                            patternMap: { ...DEFAULT_PATTERN_MAP },
                          },
                        }))
                      }}
                    />
                  )}
                </PanelSection>

              </div>

              <div className="flex shrink-0 flex-col gap-2 border-t border-white/[0.08] px-[clamp(1rem,3vw,1.35rem)] py-[clamp(0.85rem,2vw,1.1rem)] md:px-5 md:py-4">
                <CtaButton
                  busy={cartBusy}
                  disabled={!ready}
                  onClick={() => void handleAddToCart()}
                />
                {cartHint ? (
                  <p
                    className={cn(
                      'm-0 text-center text-[0.72rem] leading-snug',
                      'text-[color-mix(in_oklab,var(--ink)_58%,transparent)]',
                    )}
                  >
                    {cartHint}{' '}
                    {ready &&
                    (!user || !canAccessApp(user)) &&
                    cartHint.startsWith('Sign in') ? (
                      <Link
                        to="/auth"
                        className="font-semibold text-[color-mix(in_oklab,var(--ink)_78%,transparent)] underline decoration-[color-mix(in_oklab,var(--ink)_22%,transparent)] underline-offset-2"
                      >
                        Open sign in
                      </Link>
                    ) : null}
                  </p>
                ) : null}
                {selected ? (
                  <p className="m-0 text-center font-mono text-[0.68rem] tabular-nums text-[color-mix(in_oklab,var(--ink)_40%,transparent)]">
                    ${getGarmentCatalog(selected.id).price} ·{' '}
                    {getGarmentCatalog(selected.id).sku}
                  </p>
                ) : null}
                <p className={cn('m-0 text-center text-[0.68rem] leading-relaxed', taglineHero)}>
                  Ships in 7–14 business days
                </p>
              </div>
            </motion.aside>

          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
