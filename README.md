# charli3-js

A TypeScript SDK for Charli3 oracles on Cardano.

Built for the Charli3 Oracles Hackathon (April 2026), Oracle Tooling track.

## Goal

Read a Charli3 price feed from a TypeScript app in a few lines:

```ts
import { Charli3 } from "charli3-js";

const c3 = new Charli3({ network: "preprod" });
const price = await c3.getPrice("ADA/USD");

console.log(price.value);
```

The existing Python SDK works but needs a ~37 line YAML config and a separate Python toolchain. This SDK ships preprod presets so you don't need either.

## Status

Day 1. Just a scaffold for now. Source, examples, and a reference Aiken contract will be pushed tomorrow.

## License

MIT.
