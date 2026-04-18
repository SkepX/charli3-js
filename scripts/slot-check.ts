import {
  SLOT_CONFIG_NETWORK,
  unixTimeToEnclosingSlot,
  slotToBeginUnixTime,
} from "@lucid-evolution/plutus";

const cfg = SLOT_CONFIG_NETWORK["Preprod"];
console.log("cfg:", cfg);

const now = Date.now();
const halfWindow = 30_000;
const startMs = now - halfWindow;
const endMs = now + halfWindow;

const slotStart = unixTimeToEnclosingSlot(startMs, cfg);
const slotEnd = unixTimeToEnclosingSlot(endMs, cfg);

const backStart = slotToBeginUnixTime(slotStart, cfg);
const backEnd = slotToBeginUnixTime(slotEnd, cfg);

console.log(`now=${now}`);
console.log(`ms window: ${startMs} -> ${endMs} (len ${endMs - startMs})`);
console.log(`slots    : ${slotStart} -> ${slotEnd} (len ${slotEnd - slotStart})`);
console.log(`back ms  : ${backStart} -> ${backEnd} (len ${backEnd - backStart})`);
