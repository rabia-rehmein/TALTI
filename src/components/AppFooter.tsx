import styles from './AppFooter.module.css'

export function AppFooter() {
  return (
    <footer className={styles.footer} role="contentinfo">
      <div className={styles.inner}>
        <p className={styles.copy}>© 2026 Talti</p>
        <p className={styles.note}>Custom apparel studio</p>
      </div>
    </footer>
  )
}
