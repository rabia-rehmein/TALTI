import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type FooterChromeContextValue = {
  suppressFooter: boolean
  setSuppressFooter: (value: boolean) => void
}

const FooterChromeContext = createContext<FooterChromeContextValue | null>(null)

export function FooterChromeProvider({ children }: { children: ReactNode }) {
  const [suppressFooter, setSuppressFooter] = useState(false)
  const value = useMemo(
    () => ({ suppressFooter, setSuppressFooter }),
    [suppressFooter],
  )
  return (
    <FooterChromeContext.Provider value={value}>
      {children}
    </FooterChromeContext.Provider>
  )
}

export function useFooterChrome() {
  const ctx = useContext(FooterChromeContext)
  if (!ctx) {
    throw new Error('useFooterChrome must be used within FooterChromeProvider')
  }
  return ctx
}
