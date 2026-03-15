import { Transaction, modelsv2 } from "algosdk";

export interface SnackBar {
  text: string;
  color: string;
  timeout: number;
  display: boolean;
}

export type Address = string;
export type Base64 = string;
export type TxHash = string;

interface Txn {
  sender: Address;
  fee: number;
  firstRound: number;
  lastRound: number;
  genesisID: string;
  genesisHash: Base64;
  note?: Uint8Array | Base64;
  reKeyTo?: Address;
  group?: Uint8Array | Base64;
  flatFee: boolean;
}

interface ConfigTxn extends Txn {
  type: "acfg";
  assetManager?: Address;
  assetReserve?: Address;
  assetFreeze?: Address;
  assetClawback?: Address;
}

interface TransferTxn extends Txn {
  receiver: Address;
  amount: number;
  closeRemainderTo?: Address;
}

export interface PaymentTxn extends TransferTxn {
  type: "pay";
}

export interface AssetTxn extends TransferTxn {
  type: "axfer";
  assetRevocationTarget?: Address;
  assetIndex: number;
}

export interface AssetConfigTxn extends ConfigTxn {
  assetIndex: number;
}

export interface AssetCreateTxn extends ConfigTxn {
  assetTotal?: number;
  assetDecimals?: number;
  assetDefaultFrozen?: boolean;
  assetName?: string;
  assetUnitName?: string;
  assetURL?: string;
  assetMetadataHash?: Uint8Array | Base64;
}

export interface DestroyAssetTxn extends ConfigTxn {
  assetIndex: number;
}

export interface FreezeAssetTxn extends Txn {
  type: "afrz";
  assetIndex: number;
  freezeAccount: Address;
  freezeState: boolean;
}

export interface KeyRegTxn extends Txn {
  type: "keyreg";
  voteKey?: Base64;
  selectionKey?: Base64;
  stateProofKey?: Base64;
  voteFirst?: number;
  voteLast?: number;
  voteKeyDilution?: number;
  nonParticipation?: boolean;
}

export enum OnApplicationComplete {
  NoOpOC = 0,
  OptInOC = 1,
  CloseOutOC = 2,
  ClearStateOC = 3,
  UpdateApplicationOC = 4,
  DeleteApplicationOC = 5,
}

export interface ApplicationTxn extends Txn {
  type: "appl";
  appArgs?: Uint8Array[] | Base64[];
  appAccounts?: Address[];
  appForeignApps?: number[];
  appForeignAssets?: number[];
}

export interface CreateApplTxn extends ApplicationTxn {
  appApprovalProgram: Uint8Array | Base64;
  appClearProgram: Uint8Array | Base64;
  appLocalInts: number;
  appLocalByteSlices: number;
  appGlobalInts: number;
  appGlobalByteSlices: number;
  appOnComplete?: OnApplicationComplete; // Default value is 0
  extraPages?: number;
}

export interface CallApplTxn extends ApplicationTxn {
  appIndex: number;
  appOnComplete: OnApplicationComplete.NoOpOC;
}

export interface OptInApplTxn extends ApplicationTxn {
  appIndex: number;
  appOnComplete: OnApplicationComplete.OptInOC;
}

export interface CloseOutApplTxn extends ApplicationTxn {
  appIndex: number;
  appOnComplete: OnApplicationComplete.CloseOutOC;
}

export interface ClearApplTxn extends ApplicationTxn {
  appIndex: number;
  appOnComplete: OnApplicationComplete.ClearStateOC;
}
export interface UpdateApplTxn extends ApplicationTxn {
  appIndex: number;
  appOnComplete: OnApplicationComplete.UpdateApplicationOC;
  appApprovalProgram: Uint8Array | Base64;
  appClearProgram: Uint8Array | Base64;
}

export interface DeleteApplTxn extends ApplicationTxn {
  appIndex: number;
  appOnComplete: OnApplicationComplete.DeleteApplicationOC;
}

export type ApplTxn =
  | CreateApplTxn
  | CallApplTxn
  | OptInApplTxn
  | CloseOutApplTxn
  | ClearApplTxn
  | UpdateApplTxn;

export type EncodedTransaction = Base64 | Uint8Array;

export type AlgorandTxn =
  | PaymentTxn
  | AssetTxn
  | AssetConfigTxn
  | AssetCreateTxn
  | DestroyAssetTxn
  | FreezeAssetTxn
  | KeyRegTxn
  | ApplTxn;

export type TxnStr = Base64;
export type SignedTxnStr = Base64;

export interface MultisigMetadata {
  // Multisig version
  version: number;

  // Multisig threshold value
  threshold: number;

  // Multisig Cosigners
  addrs: Address[];
}

export interface WalletTransaction {
  // Base64 encoding of the canonical msgpack encoding of a Transaction
  txn: TxnStr;

  // Optional authorized address used to sign the transaction when the account is rekeyed
  authAddr?: Address;

  // [Not Supported] Multisig metadata used to sign the transaction
  msig?: MultisigMetadata;

  // Optional list of addresses that must sign the transactions
  signers?: Address[];

  // Optional base64 encoding of the canonical msgpack encoding of a  SignedTxn corresponding to txn, when signers=[]
  stxn?: SignedTxnStr;

  // [Not Supported] Optional message explaining the reason of the transaction
  message?: string;

  // [Not Supported] Optional message explaining the reason of this group of transaction.
  // Field only allowed in the first transaction of a group
  groupMessage?: string;
}

export interface SignTxnsOpts {
  // [Not Supported] Optional message explaining the reason of the group of transactions
  message?: string;
}

export interface SignTxnsError extends Error {
  code: number;
  data?: any;
}

export interface SignedTx {
  // Transaction hash
  txID: TxHash;
  // Signed transaction
  blob: Uint8Array;
}

export interface AccountHD extends modelsv2.Account {
  sibling?: string;
  addrIdx?: number;
}

export interface LuteAccount {
  addr: Address;
  name?: string;
  slot?: number;
  appId?: bigint;
  network?: string;
  seedId?: number;
  xpub?: string;
  idxs?: number[];
  falcon?: {
    counter: number;
    publicKey: string;
  };
}

export interface AccountInfo extends LuteAccount {
  title: string;
  isHot: boolean;
  canSign: boolean;
  subType?: "rekey" | "hd";
  info?: AccountHD;
  globalIdx: number;
  ns?: NsRecord;
}

export interface NsRecord {
  appID?: number;
  name: string;
  timeExpires?: string;
}

export interface NsObject {
  [key: string]: NsRecord;
}

export interface NsLookup {
  title: string;
  value: string;
}

export interface AccountSubs extends modelsv2.Account {
  subs?: Address[];
  xpub?: string;
}

export interface Arc55App {
  info: modelsv2.Application;
  acct: modelsv2.Account;
  addrs: Address[];
  groups: MsigGroup[];
  [key: string]: any;
}

export interface MsigGroup {
  nonce: bigint;
  txns: Transaction[];
  stxns: (string | null)[];
  sigs: MemberSigs[];
}

export interface MemberSigs {
  addr: Address;
  sigs: Base64[];
}

export interface LuteMsig {
  app: Arc55App;
  signerAddr: Address;
  bypass: boolean;
}

interface Client {
  url: string;
  port: string;
  token: string;
}

export interface Network {
  name: string;
  algod: Client;
  indexer?: Client;
  kmd?: Client;
  fallback?: {
    algod: Client;
    indexer: Client;
  };
  genesisID: string;
  genesisHash?: string;
  explorer: string;
  nfdUrl?: string;
  envoiUrl?: string;
  inboxRouter?: number;
  lutier?: { app: number; asset: number };
}

export interface TinyAsset {
  id: string;
  name: string;
  unit_name: string;
  decimals: number;
  url: string;
  total_amount: string;
  logo: {
    png: string;
    svg: string;
  };
  deleted: boolean;
}

export interface SeedData {
  id: number;
  data?: ArrayBuffer;
  iv?: Uint8Array;
  salt?: Uint8Array;
  credentialId?: string;
}

export interface MsgpackHD {
  hd: {
    sibling?: string;
    addrIdx?: number;
  };
  ai: string;
}

export interface Siwa {
  domain: string;
  account_address: string;
  uri: string;
  version: string;
  statement?: string;
  nonce?: string;
  "issued-at"?: string;
  "expiration-time"?: string;
  "not-before"?: string;
  "request-id"?: string;
  chain_id: "283";
  resources?: string[];
  type: "ed25519";
}

interface SendType {
  title: string;
  key: "pay" | "axfer" | "keyreg" | "rekey" | "swap";
  fields?: string[];
}
