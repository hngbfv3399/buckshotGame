export function shouldRestoreRoom(search: string, savedCode: string | null) {
  const requestedCode = new URLSearchParams(search).get('room')?.trim().toUpperCase()
  return Boolean(requestedCode && requestedCode === savedCode)
}
