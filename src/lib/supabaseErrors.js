/**
 * Supabase RPC error detection helpers shared across lib modules.
 * `isMissingRpc` recognizes the classic "function X does not exist" error
 * thrown when a required database function/trigger wasn't created from
 * supabase_echocore_full.sql.
 */
export function isMissingRpc(error) {
  return error?.message?.includes('function') && error?.message?.includes('does not exist');
}

/** Full setup message for the standard "run the bootstrap SQL" instruction. */
export function buildRpcSetupMsg(featureLabel) {
  return `${featureLabel} is not configured. Run supabase_echocore_full.sql in the Supabase SQL Editor.`;
}
