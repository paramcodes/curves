import type { RouterOutputs } from "@curves/api/root";

/**
 * Type-only contract canary (phase-2 acceptance: "a deliberate contract change
 * fails typecheck in apps/web"). tRPC infers the API's output types across
 * packages — if a router procedure's output shape changes, this file (and any
 * real consumer) fails `pnpm check` in web. No runtime code; compiled away.
 */
export type MeOutput = RouterOutputs["users"]["me"];
const meHasName: MeOutput["name"] = "probe";

export { meHasName };
