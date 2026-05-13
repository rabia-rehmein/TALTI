import { MODELS } from './modelPaths'
import { FIT_MAX_COMPACT, FIT_MAX_STUDIO } from './garmentFit'

/**
 * Per-GLB framing after automatic centre + uniform scale (`FIT_MAX_*` in `garmentFit.ts`).
 *
 * Available paths:
 * - MODELS.male.tshirt, longSleeve, collarButtonDown, shirtBaked
 * - MODELS.female.buttonShirt, girlsShirt, longShirt, tshirt
 *
 * ## Offsets (see `offsetRelativeToFit`)
 * By default, `offset` / `offsetStudio` values are **dimensionless factors**: each component is
 * multiplied by the active fit target from `getFitTarget` (`FIT_MAX_COMPACT` in cards; in studio
 * `FIT_MAX_STUDIO` × optional `studioFitMul` so offsets stay tied to bbox fit for every GLB).
 * So when you change `FIT_MAX_COMPACT`, vertical placement stays visually consistent.
 *
 * Set `offsetUseSceneUnits: true` to use raw scene-world units instead (not scaled by FIT_MAX).
 *
 * `cameraCard` / `cameraStudio` — optional camera `y` / `z` (x stays 0).
 * Defaults: card [0, 0, 2.8], studio [0, 0, 3.0].
 */
export type GarmentViewConfig = {
  /** Used in card grid; also in studio if `offsetStudio` omitted */
  offset?: { x?: number; y?: number; z?: number }
  /** Optional studio-only pose; falls back to `offset` */
  offsetStudio?: { x?: number; y?: number; z?: number }
  /**
   * Stacked / narrow studio (`mobileStudio`). When set, used **instead of** `offsetStudio` on mobile and
   * the global `MOBILE_STUDIO_OFFSET_Y_EXTRA` is **not** applied — tune Y like `offsetStudio` (× fit target).
   */
  offsetStudioMobile?: { x?: number; y?: number; z?: number }
  /**
   * When false (default): offset × fit target for current view (recommended).
   * When true: offset values are applied as-is in scene units (legacy).
   */
  offsetUseSceneUnits?: boolean
  cameraCard?: { y?: number; z?: number }
  cameraStudio?: { y?: number; z?: number }
  /**
   * Stacked / narrow studio: camera `y` / `z` when `mobileStudio`. When set, used **instead of**
   * `cameraStudio` and global mobile camera delta / mul are **not** applied.
   */
  cameraStudioMobile?: { y?: number; z?: number }
  /**
   * Orbit `lookAt` Y when `mobileStudio` (default `MOBILE_STUDIO_LOOK_AT_Y`).
   */
  lookAtStudioMobileY?: number
  /**
   * Studio only: multiplies `FIT_MAX_STUDIO` for bbox fit **and** for offset scaling (with male/female).
   * Default `1` — same base size as other garments; raise slightly (e.g. 1.05–1.12) if a GLB reads small.
   */
  studioFitMul?: number
}

const DEFAULT_CAMERA_CARD: [number, number, number] = [0, 0, 2.8]
const DEFAULT_CAMERA_STUDIO: [number, number, number] = [0, 0, 3.0]

/**
 * Stacked studio (`viewport &lt; lg`): multiplies `FIT_MAX_STUDIO` for bbox fit + offset scale.
 * Desktop studio omits this entirely. Lower = smaller garment in the viewer on narrow layouts.
 */
const MOBILE_STUDIO_FIT_MUL = 1.35
/**
 * Extra dimensionless Y before × fitTarget (more negative = lower on screen).
 */
const MOBILE_STUDIO_OFFSET_Y_EXTRA = -0.98
/** Higher eyeline + look slightly below origin keeps the hem in frame when offset/size go up */
const MOBILE_STUDIO_CAM_Y_DELTA = 0.38
/** Slightly farther than 0.9 so large fits + zoom stay in front of a tight `near` plane */
const MOBILE_STUDIO_CAM_Z_MUL = 0.93
/** Aim a touch below center so the lower garment stays inside the frustum */
const MOBILE_STUDIO_LOOK_AT_Y = -0.28

/** Seeded to match previous globals: studio pose + `MOBILE_STUDIO_OFFSET_Y_EXTRA`, camera + delta / mul. */
function mobileStudioOffsetY(studioY: number): number {
  return studioY + MOBILE_STUDIO_OFFSET_Y_EXTRA
}
function mobileStudioCamera(cam: { y?: number; z?: number } | undefined): {
  y: number
  z: number
} {
  const y = (cam?.y ?? DEFAULT_CAMERA_STUDIO[1]) + MOBILE_STUDIO_CAM_Y_DELTA
  const z = (cam?.z ?? DEFAULT_CAMERA_STUDIO[2]) * MOBILE_STUDIO_CAM_Z_MUL
  return { y, z }
}

/**
 * Dimensionless factors × FIT_MAX — tuned so changing FIT_MAX_COMPACT doesn’t break framing.
 * (Converted from previous scene-unit offsets at FIT_MAX_COMPACT = 1.5.)
 */
export const GARMENT_VIEW: Partial<Record<string, GarmentViewConfig>> = {
  [MODELS.male.tshirt]: {
    offset: { y: -0.3 },
    offsetStudio: { y: -0.273 },
    offsetStudioMobile: { y: mobileStudioOffsetY(0.5) },
    cameraCard: { y: 0.26, z: 2.76 },
    cameraStudio: { y: 0.14, z: 2.94 },
    cameraStudioMobile: mobileStudioCamera({ y: 0.14, z: 2.94 }),
  },
  [MODELS.male.longSleeve]: {
    offset: { y: -0.87 },
    offsetStudio: { y: -0.70 },
    offsetStudioMobile: { y: mobileStudioOffsetY(-0.16) },
    cameraCard: { y: 0.32, z: 2.74 },
    cameraStudio: { y: 0.2, z: 2.9 },
    cameraStudioMobile: mobileStudioCamera({ y: 0.2, z: 2.9 }),
  },
  [MODELS.male.collarButtonDown]: {
    /** Dimensionless × FIT_MAX_* — more negative = lower in frame. */
    offset: { y: -0.933 },
    offsetStudio: { y: -0.75 },
    offsetStudioMobile: { y: mobileStudioOffsetY(-0.75) },
    cameraCard: { y: 0.58, z: 2.62 },
    cameraStudio: { y: 0.38, z: 2.84 },
    cameraStudioMobile: mobileStudioCamera({ y: 0.38, z: 2.84 }),
  },
  [MODELS.male.shirtBaked]: {
    offset: { y: 0.067 },
    offsetStudio: { y: 0.045 },
    offsetStudioMobile: { y: mobileStudioOffsetY(0.85) },
    cameraStudioMobile: mobileStudioCamera(undefined),
  },

  // ── Female (same offset/camera system as male — × FIT_MAX_COMPACT / FIT_MAX_STUDIO) ──

  [MODELS.female.tshirt]: {
    offset: { y: -0 },
    offsetStudio: { y: -0 },
    offsetStudioMobile: { y: mobileStudioOffsetY(0.75) },
    cameraCard: { y: 0.26, z: 2.76 },
    cameraStudio: { y: 0.14, z: 2.94 },
    cameraStudioMobile: mobileStudioCamera({ y: 0.14, z: 2.94 }),
  },
  [MODELS.female.buttonShirt]: {
    offset: { y: -0.85 },
    offsetStudio: { y: -0.68 },
    offsetStudioMobile: { y: mobileStudioOffsetY(-0.68) },
    cameraCard: { y: 0.52, z: 2.64 },
    cameraStudio: { y: 0.34, z: 2.86 },
    cameraStudioMobile: mobileStudioCamera({ y: 0.34, z: 2.86 }),
  },
  [MODELS.female.girlsShirt]: {
    offset: { y: -0.42 },
    offsetStudio: { y: -0.36 },
    offsetStudioMobile: { y: mobileStudioOffsetY(-0.36) },
    cameraCard: { y: 0.3, z: 2.74 },
    cameraStudio: { y: 0.17, z: 2.92 },
    cameraStudioMobile: mobileStudioCamera({ y: 0.17, z: 2.92 }),
  },
  [MODELS.female.longShirt]: {
    offset: { y: -0.58 },
    offsetStudio: { y: -0.5 },
    offsetStudioMobile: { y: mobileStudioOffsetY(-0.5) },
    cameraCard: { y: 0.38, z: 2.7 },
    cameraStudio: { y: 0.24, z: 2.9 },
    cameraStudioMobile: mobileStudioCamera({ y: 0.24, z: 2.9 }),
  },
}

/** Optional studio tuning when the layout is stacked (Design page: viewport &lt; `lg`). */
export type GarmentStudioOpts = {
  mobileStudio?: boolean
}

/** Cards: `FIT_MAX_COMPACT`. Studio: `FIT_MAX_STUDIO` × `studioFitMul` (per GLB, default 1). */
export function getFitTarget(
  path: string,
  compact: boolean,
  opts?: GarmentStudioOpts,
): number {
  const cfg = GARMENT_VIEW[path]
  if (compact) return FIT_MAX_COMPACT
  let t = FIT_MAX_STUDIO * (cfg?.studioFitMul ?? 1)
  if (opts?.mobileStudio) t *= MOBILE_STUDIO_FIT_MUL
  return t
}

export function getModelOffset(
  path: string,
  compact: boolean,
  opts?: GarmentStudioOpts,
): { x: number; y: number; z: number } {
  const cfg = GARMENT_VIEW[path]
  const useMobilePose =
    !compact && opts?.mobileStudio && cfg?.offsetStudioMobile != null

  let base: { x?: number; y?: number; z?: number } | undefined
  if (compact) {
    base = cfg?.offset
  } else if (useMobilePose) {
    base = cfg!.offsetStudioMobile
  } else {
    base = cfg?.offsetStudio ?? cfg?.offset
  }

  if (base == null) return { x: 0, y: 0, z: 0 }

  const fitTarget = getFitTarget(path, compact, opts)
  const useScene = cfg?.offsetUseSceneUnits === true
  const m = useScene ? 1 : fitTarget

  const yExtra =
    !compact && opts?.mobileStudio && !useMobilePose
      ? MOBILE_STUDIO_OFFSET_Y_EXTRA
      : 0

  return {
    x: (base.x ?? 0) * m,
    y: ((base.y ?? 0) + yExtra) * m,
    z: (base.z ?? 0) * m,
  }
}

export function getGarmentCamera(
  path: string,
  compact: boolean,
  opts?: GarmentStudioOpts,
): [number, number, number] {
  const cfg = GARMENT_VIEW[path]
  const base = compact ? DEFAULT_CAMERA_CARD : DEFAULT_CAMERA_STUDIO
  const useMobileCam =
    !compact && opts?.mobileStudio && cfg?.cameraStudioMobile != null
  const cam = compact
    ? cfg?.cameraCard
    : useMobileCam
      ? cfg?.cameraStudioMobile
      : cfg?.cameraStudio
  let y = cam?.y ?? base[1]
  let z = cam?.z ?? base[2]
  if (!compact && opts?.mobileStudio && !useMobileCam) {
    y += MOBILE_STUDIO_CAM_Y_DELTA
    z *= MOBILE_STUDIO_CAM_Z_MUL
  }
  return [0, y, z]
}

/** Orbit + `lookAt` focal point; mobile aims below origin to frame hem and center mass */
export function getGarmentCameraLookAt(
  path: string,
  compact: boolean,
  opts?: GarmentStudioOpts,
): [number, number, number] {
  if (compact || !opts?.mobileStudio) return [0, 0, 0]
  const ly =
    GARMENT_VIEW[path]?.lookAtStudioMobileY ?? MOBILE_STUDIO_LOOK_AT_Y
  return [0, ly, 0]
}
