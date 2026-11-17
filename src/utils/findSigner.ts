import type { AccountInfo, LuteAccount } from "@/types";
import { formatAddr } from "@/utils/formatAddr";
import { signingAddr } from "@/utils/signingAddr";

/** ARC-1 4100: the account is not one the user can sign with here. */
export const UNAUTHORIZED = 4100;

export interface SignerContext {
  accounts: LuteAccount[];
  acctInfo: AccountInfo[];
  info: { address: unknown; authAddr?: unknown }[];
  networkName: string;
}

/**
 * The wallet account that signs this txn, or an error saying why there is
 * none, worded for the dapp to show as is.
 */
export function findSigner(
  txn: { sender: { toString(): string } },
  authAddr: string | undefined,
  msig: { signerAddr: unknown } | undefined,
  ctx: SignerContext
): AccountInfo {
  const sender = txn.sender.toString();
  const addr = signingAddr(txn, authAddr, msig, ctx.info);
  const acct = ctx.acctInfo.find((a) => a.addr === addr);
  if (acct?.canSign) return acct;
  throw Error(signerProblem(sender, addr, acct, ctx), {
    cause: UNAUTHORIZED,
  });
}

function signerProblem(
  sender: string,
  addr: string,
  acct: AccountInfo | undefined,
  ctx: SignerContext
) {
  const who = `Account ${formatAddr(addr)}`;
  // A watch account, or a multi-sig one in a request msigCheck skips.
  if (acct) return `${who} has no signing key in Lute`;
  const network = ctx.accounts.find((a) => a.addr === addr)?.network;
  if (network && network !== ctx.networkName)
    return `${who} is limited to ${network} in Lute, not ${ctx.networkName}`;
  if (addr !== sender)
    return `${formatAddr(sender)} is rekeyed to ${formatAddr(addr)}, which is not in Lute`;
  return `${who} is not in Lute`;
}
