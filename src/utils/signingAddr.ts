/** A wrong pick cannot forge anything, only yield a signature the network rejects. */
export function signingAddr(
  txn: { sender: { toString(): string } },
  authAddr: string | undefined,
  msig: { signerAddr: unknown } | undefined,
  info: { address: unknown; authAddr?: unknown }[]
): string {
  const sender = txn.sender.toString();
  const onChain = info.find((i) => String(i.address) === sender)?.authAddr;
  return String(msig?.signerAddr || authAddr || onChain || sender);
}
