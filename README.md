# charli3-js

TypeScript SDK for the Charli3 pull oracle on Cardano. One import, one call, a fresh price on chain.

**npm:** https://www.npmjs.com/package/charli3-js

```bash
npm install charli3-js
```

```ts
import { Charli3 } from "charli3-js";

const c3 = new Charli3({ network: "preprod" });
const { price } = await c3.getOdvReference("ADA/USD");
console.log(price.value, price.isExpired);
```

Proper documentation, demo video, and test app landing tomorrow.

## License

MIT
