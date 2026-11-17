// No imports, so modules that avoid the @/utils barrel can use it.
export function formatAddr(addr: string | undefined) {
  if (!addr) return "";
  return `${addr?.substring(0, 6)}…${addr?.substring(52)}`;
}
