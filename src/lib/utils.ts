export function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}
