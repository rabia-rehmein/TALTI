import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import type { Group } from 'three'
import { MODELS } from '../lib/modelPaths'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ObjectMap } from '@react-three/fiber'

const TILT = 10 * (Math.PI / 180)

/** Procedural grey jersey-knit fabric texture — no external file needed */
function makeGreyFabricTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // base — medium-dark grey
  ctx.fillStyle = '#888888'
  ctx.fillRect(0, 0, size, size)

  // subtle horizontal knit lines
  for (let y = 0; y < size; y += 4) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(size, y)
    ctx.strokeStyle = y % 8 === 0 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // very fine vertical weave threads
  for (let x = 0; x < size; x += 4) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, size)
    ctx.strokeStyle = 'rgba(0,0,0,0.04)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }

  // grain noise pass
  for (let i = 0; i < 18000; i++) {
    const gx = Math.random() * size
    const gy = Math.random() * size
    const alpha = Math.random() * 0.045
    ctx.fillStyle = `rgba(0,0,0,${alpha})`
    ctx.fillRect(gx, gy, 1, 1)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(8, 8)
  return tex
}

type ShirtGLTF = GLTF & ObjectMap & {
  nodes: {
    default002: THREE.Mesh
    default002_1: THREE.Mesh
  }
  materials: {
    'Polo Shirt': THREE.MeshStandardMaterial
    Button: THREE.MeshStandardMaterial
  }
}

function ShirtModel({ modelScale }: { modelScale: number }) {
  const spinner  = useRef<Group>(null)
  const follower = useRef<Group>(null)
  const { mouse } = useThree()
  const { nodes, materials } = useGLTF(MODELS.male.tshirt) as unknown as ShirtGLTF

  const fabricTex = useMemo(() => makeGreyFabricTexture(), [])

  const shirtMat = useMemo(() => {
    const mat = (materials['Polo Shirt'] as THREE.MeshStandardMaterial).clone()
    mat.map = fabricTex
    mat.color.set('#8a8a8a')
    mat.roughness = 0.9
    mat.metalness = 0.0
    mat.needsUpdate = true
    return mat
  }, [materials, fabricTex])

  const buttonMat = useMemo(() => {
    const mat = (materials['Button'] as THREE.MeshStandardMaterial).clone()
    mat.map = null
    mat.color.set('#ffffff')
    mat.roughness = 0.3
    mat.metalness = 0.05
    mat.needsUpdate = true
    return mat
  }, [materials])

  useFrame((_state, delta) => {
    if (spinner.current) {
      spinner.current.rotation.y += delta * 0.45
    }
    if (follower.current) {
      follower.current.rotation.x = THREE.MathUtils.lerp(
        follower.current.rotation.x,
        TILT + mouse.y * -0.22,
        0.08,
      )
      follower.current.rotation.z = THREE.MathUtils.lerp(
        follower.current.rotation.z,
        mouse.x * 0.14,
        0.08,
      )
    }
  })

  return (
    <group ref={follower} position={[0, -0.05, 0]} scale={modelScale}>
      <group ref={spinner}>
        <mesh
          castShadow
          geometry={nodes.default002.geometry}
          material={shirtMat}
          dispose={null}
        />
        <mesh
          geometry={nodes.default002_1.geometry}
          material={buttonMat}
          dispose={null}
        />
      </group>
    </group>
  )
}

export function HeroShirt() {
  const [viewportW, setViewportW] = useState<number>(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  )

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Phone screens need a smaller model and a wider FOV to avoid cropping.
  const camera = useMemo(() => {
    if (viewportW <= 430) return { position: [0, 0, 2.9] as const, fov: 42 }
    if (viewportW <= 768) return { position: [0, 0, 3.05] as const, fov: 34 }
    return { position: [0, 0, 2.6] as const, fov: 28 }
  }, [viewportW])

  const modelScale = useMemo(() => {
    if (viewportW <= 360) return 0.76 * 4
    if (viewportW <= 430) return 0.80 * 4.1
    if (viewportW <= 768) return 0.95 * 3.1
    return 1 * 2
  }, [viewportW])

  return (
    <Canvas
      shadows
      camera={camera}
      gl={{ preserveDrawingBuffer: true, alpha: true }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight castShadow position={[2, 4, 5]} intensity={1.3} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />
      <Environment preset="city" />
      <ContactShadows
        position={[0, -0.75, 0]}
        opacity={0.28}
        scale={2.5}
        blur={2.2}
        far={1}
      />
      <Suspense fallback={null}>
        <ShirtModel modelScale={modelScale} />
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload(MODELS.male.tshirt)
