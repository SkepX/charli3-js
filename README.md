# charli3-js

TypeScript SDK for [Charli3](https://charli3.io) oracles on Cardano.

Built for the **Charli3 Oracles Hackathon** (April 2026) — Oracle Tooling track.

## Goal

Make consuming Charli3 price feeds from a TypeScript DApp as simple as:

```ts
import { Charli3 } from "charli3-js";

const c3 = new Charli3({ network: "preprod" });
const price = await c3.getPrice("ADA/USD");

console.log(price.value);
```

No YAML configs. No Python. No subprocess CLIs. Pre-baked network presets.

## Status

Day 1 — scaffolding in progress. Source, examples, and a reference Aiken
contract land over the next few days.

## License

MIT.
