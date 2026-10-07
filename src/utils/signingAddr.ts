/**
 * The account whose key signs `txn`, in order: the multisig member signing for
 * the whole request, the auth address the dapp names, the sender's on-chain
 * auth address, or else the sender. Choosing wrongly cannot forge anything,
 * only produce a signature the network rejects.
 */
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
