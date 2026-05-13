import type { ReactNode } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'
import styles from './ShaderBackground.module.css'

interface ShaderBackgroundProps {
  children: ReactNode
}

export function ShaderBackground({ children }: ShaderBackgroundProps) {
  return (
    <div className={styles.root}>
      <div className={styles.canvasSlot}>
        <MeshGradient
        colors={['#0a0a0c', '#1a1a1f', '#0f0f12', '#2c2c32', '#141418']}
        speed={0.65}
        distortion={0.78}
        swirl={0.16}
        />
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  )
}
