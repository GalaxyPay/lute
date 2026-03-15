import { ABIContract } from "algosdk";
import arc4 from "./MsigApp.arc4.json";
import networks from "./networks.json";

const msigAbiContract = new ABIContract(arc4);
export { msigAbiContract, networks };
