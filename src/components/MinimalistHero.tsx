import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { HeroShirt } from './HeroShirt'
import styles from './MinimalistHero.module.css'

const ease = [0.22, 1, 0.36, 1] as const

export function MinimalistHero() {
  return (
    <section className={styles.hero} aria-label="Talti hero">

      {/* ── top eyebrow bar ─────────────────────────────── */}
      <div className={styles.bar}>
        <motion.span
          className={styles.barTag}
          initial={{ opacity: 1, x: 0 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          Custom Apparel Studio — 2026
        </motion.span>
        <motion.span
          className={styles.barTag}
          initial={{ opacity: 1, x: 0 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          Upload · Preview · Order
        </motion.span>
      </div>

      {/* ── centre stage ────────────────────────────────── */}
      <div className={styles.stage}>

        {/* large ghost headline behind shirt */}
        <motion.h1
          className={`${styles.wordmark} ${styles.wordmarkSpaced}`}
          aria-label="Talti"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 0.1 }}
        >
          TALTI
        </motion.h1>

        {/* 3-D shirt */}
        <div className={styles.modelWrap}>
          <motion.div
            className={styles.model}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease, delay: 0.2 }}
          >
            <HeroShirt />
          </motion.div>

          {/* sub-label below the model */}
          <motion.div
            className={styles.sub}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.75 }}
          >
            <span>Upload your pattern</span>
            <span className={styles.subDot} aria-hidden="true" />
            <span>Preview in 3-D</span>
            <span className={styles.subDot} aria-hidden="true" />
            <span>Order your piece</span>
          </motion.div>
        </div>

      </div>

      {/* ── bottom dock ─────────────────────────────────── */}
      <motion.div
        className={styles.dock}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease, delay: 0.55 }}
      >
        <p className={styles.tagline}>
          Design the exact clothing you&rsquo;ve always imagined.
        </p>
        <Link to="/design" className={styles.cta}>
          Start designing <span aria-hidden="true">→</span>
        </Link>
      </motion.div>

    </section>
  )
}
