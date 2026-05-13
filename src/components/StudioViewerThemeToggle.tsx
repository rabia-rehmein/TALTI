import { useId } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Switch } from './ui/switch'
import { cn } from '../lib/utils'

type Props = {
  /** True when the 3D viewer uses the muted grey cyclorama (readable with dark type). */
  viewerLight: boolean
  onViewerLightChange: (light: boolean) => void
  className?: string
}

/**
 * Sun / Moon + Radix switch.
 * Unchecked = light grey studio backdrop + dark chrome; checked = dark studio + light chrome.
 * (Switch checked means “dark viewer” / moon side active.)
 */
export function StudioViewerThemeToggle({
  viewerLight,
  onViewerLightChange,
  className,
}: Props) {
  const id = useId()
  const isDarkViewer = !viewerLight

  const iconBase =
    'flex cursor-pointer items-center justify-center rounded-md p-0.5 transition-opacity duration-200 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [&_svg]:size-4 [&_svg]:shrink-0'

  const sunIconClass = cn(
    iconBase,
    viewerLight
      ? cn(
          'text-[var(--studio-on-light-fg)] focus-visible:ring-[color-mix(in_oklab,var(--studio-on-light-fg)_28%,transparent)] focus-visible:ring-offset-[var(--studio-light-bg)]',
          isDarkViewer ? 'opacity-45' : 'opacity-100',
        )
      : cn(
          'text-white focus-visible:ring-white/40 focus-visible:ring-offset-[var(--studio-dark-bg)]',
          isDarkViewer ? 'opacity-45' : 'opacity-100',
        ),
  )

  const moonIconClass = cn(
    iconBase,
    viewerLight
      ? cn(
          'text-[var(--studio-on-light-fg)] focus-visible:ring-[color-mix(in_oklab,var(--studio-on-light-fg)_28%,transparent)] focus-visible:ring-offset-[var(--studio-light-bg)]',
          !isDarkViewer ? 'opacity-45' : 'opacity-100',
        )
      : cn(
          'text-white focus-visible:ring-white/40 focus-visible:ring-offset-[var(--studio-dark-bg)]',
          !isDarkViewer ? 'opacity-45' : 'opacity-100',
        ),
  )

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span
        id={`${id}-light`}
        className={sunIconClass}
        aria-label="Use light viewer background"
        aria-controls={id}
        onClick={() => onViewerLightChange(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onViewerLightChange(true)
          }
        }}
        role="button"
        tabIndex={0}
      >
        <Sun strokeWidth={2} aria-hidden />
      </span>

      <Switch
        id={id}
        checked={isDarkViewer}
        onCheckedChange={(dark) => onViewerLightChange(!dark)}
        aria-labelledby={`${id}-light ${id}-dark`}
        aria-label="Toggle viewer between light and dark background"
        thumbClassName={
          viewerLight
            ? 'bg-[var(--studio-on-light-fg)] shadow-md'
            : 'bg-[color-mix(in_oklab,var(--ink)_94%,transparent)] shadow-md'
        }
        className={cn(
          viewerLight
            ? 'focus-visible:ring-[color-mix(in_oklab,var(--studio-on-light-fg)_25%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--studio-light-bg)] data-[state=checked]:bg-[color-mix(in_oklab,var(--studio-on-light-fg)_20%,transparent)] data-[state=unchecked]:bg-[color-mix(in_oklab,var(--studio-on-light-fg)_11%,transparent)]'
            : 'focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--studio-dark-bg)] data-[state=checked]:bg-white/26 data-[state=unchecked]:bg-white/13',
        )}
      />

      <span
        id={`${id}-dark`}
        className={moonIconClass}
        aria-label="Use dark viewer background"
        aria-controls={id}
        onClick={() => onViewerLightChange(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onViewerLightChange(false)
          }
        }}
        role="button"
        tabIndex={0}
      >
        <Moon strokeWidth={2} aria-hidden />
      </span>
    </div>
  )
}
