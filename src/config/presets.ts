import type { NetworkPreset } from "../types";

const ORACLE_FEED_TOKEN_NAME_HEX = "4f7261636c6546656564";

const PREPROD_ODV_ADDRESS =
  "addr_test1wq3pacs7jcrlwehpuy3ryj8kwvsqzjp9z6dpmx8txnr0vkq6vqeuu";

const PREPROD_REF_SCRIPT = {
  address:
    "addr_test1wrtqtdlqc66rzl2hcjhq5p0dfmalw944pwcne6p5kafthhqtzp03x",
  txHash: "7a69e9d3d90826f861107e4b503c56e08c40d092416a50bad37fc89865a78cd1",
  outputIndex: 0,
};

const PREPROD_ODV_VALIDITY_MS = 300_000;

const PREPROD_SYSTEM_START_MS = 1654041600000;

export const PREPROD: NetworkPreset = {
  network: "preprod",
  kupoUrl: "http://35.209.192.203:1442",
  ogmiosUrl: "http://35.209.192.203:1337",
  systemStartMs: PREPROD_SYSTEM_START_MS,
  feeds: {
    "ADA/USD": {
      pair: "ADA/USD",
      address:
        "addr_test1wzn5ee2qaqvly3hx7e0nk3vhm240n5muq3plhjcnvx9ppjgf62u6a",
      policyId: "1116903479e7320b8e4592207aaebf627898267fcd80e2d9646cbf07",
      tokenName: ORACLE_FEED_TOKEN_NAME_HEX,
      updateFrequencyMinutes: 30,
    },
    "ADA/C3": {
      pair: "ADA/C3",
      address:
        "addr_test1wr64gtafm8rpkndue4ck2nx95u4flhwf643l2qmg9emjajg2ww0nj",
      policyId: "5e4a2431a465a00dc5d8181aaff63959bb235d97013e7acb50b55bc4",
      tokenName: ORACLE_FEED_TOKEN_NAME_HEX,
    },
    "SHEN/USD": {
      pair: "SHEN/USD",
      address:
        "addr_test1wqlcn3pks3xdptxjw9pqrqtcx6ev694sstsruw3phd57ttg0lh0zq",
      policyId: "2b556df9f37c04ef31b8f7f581c4e48174adcf5041e8e52497d81556",
      tokenName: ORACLE_FEED_TOKEN_NAME_HEX,
    },
    "USDM/USD": {
      pair: "USDM/USD",
      address:
        "addr_test1wr0q3fr83cr0zv4gfdvzcquqzy242hgmvt7ey2d938rtwugyc76x9",
      policyId: "424f268a65632944ddfe17967208178082058cbe9044f53aee28697d",
      tokenName: ORACLE_FEED_TOKEN_NAME_HEX,
    },
  },
  odvFeeds: {
    "ADA/USD": {
      pair: "ADA/USD",
      policyId: "886dcb2363e160c944e63cf544ce6f6265b22ef7c4e2478dd975078e",
      oracleAddress: PREPROD_ODV_ADDRESS,
      validityLengthMs: PREPROD_ODV_VALIDITY_MS,
      referenceScript: PREPROD_REF_SCRIPT,
      feedPrecision: 6,
      nodes: [
        {
          url: "http://35.208.117.223:8001",
          publicKey:
            "582037c6febc9c2f940a38a5c1ea35eb9353ae233497bf9564395c76bf7b0590c4eb",
        },
        {
          url: "http://35.208.117.223:8002",
          publicKey:
            "58205a23e6016659b8c644efcb49301184f6d712037579df6793a50eae332f510248",
        },
      ],
    },
    "BTC/USD": {
      pair: "BTC/USD",
      policyId: "43d766bafc64c96754353e9686fac6130990a4f8568b3a2f76e2643f",
      oracleAddress: PREPROD_ODV_ADDRESS,
      validityLengthMs: PREPROD_ODV_VALIDITY_MS,
      referenceScript: PREPROD_REF_SCRIPT,
      feedPrecision: 6,
      nodes: [
        {
          url: "http://35.208.117.223:8003",
          publicKey:
            "58207973c66464a92c0487de83687816989083d66606e0d0fa226fefa3c5a9af5505",
        },
        {
          url: "http://35.208.117.223:8004",
          publicKey:
            "5820996de07c17761d5783e8e75d619673e7d7520e215c9b45d813170c65b2c10441",
        },
      ],
    },
    "USDM/ADA": {
      pair: "USDM/ADA",
      policyId: "fcc738fa9ae006bc8de82385ff3457a2817ccc4eaa5ce53a61334674",
      oracleAddress: PREPROD_ODV_ADDRESS,
      validityLengthMs: PREPROD_ODV_VALIDITY_MS,
      referenceScript: PREPROD_REF_SCRIPT,
      feedPrecision: 6,
      nodes: [
        {
          url: "http://35.208.117.223:8005",
          publicKey:
            "582072ec81d38f283d0fc7f7ca7c60305cb9906bee70932ad499b8d7a5cb8a28bf3c",
        },
        {
          url: "http://35.208.117.223:8006",
          publicKey:
            "58200e252c0faa2579aad50cc36eed081eb8021bd7a81f0c587c1db3fce07c3a8547",
        },
      ],
    },
  },
};

export const MAINNET: NetworkPreset = {
  network: "mainnet",
  kupoUrl: "",
  systemStartMs: 1506203091000,
  feeds: {},
  odvFeeds: {},
};

export const PRESETS: Record<string, NetworkPreset> = {
  preprod: PREPROD,
  mainnet: MAINNET,
};

export function getPreset(network: "preprod" | "mainnet"): NetworkPreset {
  const preset = PRESETS[network];
  if (!preset) throw new Error(`Unknown network: ${network}`);
  if (network === "mainnet" && !preset.kupoUrl) {
    throw new Error(
      "Mainnet preset is not yet configured. Pass your own kupoUrl in Charli3Config.",
    );
  }
  return preset;
}
