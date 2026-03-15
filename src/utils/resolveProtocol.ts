import { Address } from "algosdk";
import { CID, type Version } from "multiformats/cid";
import * as digest from "multiformats/hashes/digest";
import { sha256 } from "multiformats/hashes/sha2";

export async function resolveProtocol(url: string, reserveAddr: string) {
  const ARC3_URL_SUFFIX = "#arc3";
  let isARC69 = true;

  if (url.endsWith(ARC3_URL_SUFFIX)) {
    url = url.slice(0, url.length - ARC3_URL_SUFFIX.length);
    isARC69 = false;
  }

  const chunks = url.split("://");
  // Check if prefix is template-ipfs and if {ipfscid:..} is where CID would normally be
  if (chunks[0] === "template-ipfs" && chunks[1]?.startsWith("{ipfscid:")) {
    isARC69 = false;
    // Look for something like: template:ipfs://{ipfscid:1:raw:reserve:sha2-256} and parse into components
    chunks[0] = "ipfs";
    const cidComponents = chunks[1].split(":");
    if (cidComponents.length !== 5) {
      // give up
      console.log("unknown ipfscid format");
      return url;
    }
    const [, cidVersion, cidCodec, asaField, cidHash] = cidComponents;

    const cidVersionInt = parseInt(cidVersion!) as Version;
    if (cidHash?.split("}")[0] !== "sha2-256") {
      console.log("unsupported hash:", cidHash);
      return url;
    }
    if (cidCodec !== "raw" && cidCodec !== "dag-pb") {
      console.log("unsupported codec:", cidCodec);
      return url;
    }
    if (asaField !== "reserve") {
      console.log("unsupported asa field:", asaField);
      return url;
    }
    let cidCodecCode;
    if (cidCodec === "raw") {
      cidCodecCode = 0x55;
    } else if (cidCodec === "dag-pb") {
      cidCodecCode = 0x70;
    }

    // get 32 bytes Uint8Array reserve address - treating it as 32-byte sha2-256 hash
    const addr = Address.fromString(reserveAddr);
    const mhdigest = digest.create(sha256.code, addr.publicKey);

    const cid = CID.create(cidVersionInt, cidCodecCode!, mhdigest);
    chunks[1] = cid.toString() + "/" + chunks[1].split("/").slice(1).join("/");
  }

  // No protocol specified, give up
  if (chunks.length < 2) return url;

  const ipfsGateway = "https://ipfs.algonode.dev/ipfs/";

  //Switch on the protocol
  switch (chunks[0]) {
    case "ipfs": //Its ipfs, use the configured gateway
      url = ipfsGateway + chunks[1];
      break;
    case "https": //Its already http, just return it
      break;
    // TODO: Future options may include arweave or algorand
  }

  if (!isARC69) {
    const response = await fetch(url);
    const imgData = await response.json();
    if (imgData.image) url = imgData.image.replace("ipfs://", ipfsGateway);
  }

  return url;
}
