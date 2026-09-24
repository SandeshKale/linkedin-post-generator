// Thin wrapper around the Jev (TypeSafe AI) SDK for this repo's one use:
// content-quality judgments on a manifest before it reaches build.mjs.
//
// The SDK's TypeSafeClient reads its key from process.env.TYPESAFE_API_KEY
// by default, but this environment provisions it as JEV_API_KEY — so it's
// passed explicitly via the `apiKey` config option instead of renaming the
// env var. Never log/print this value; the SDK's own request logging
// (logLevel) redacts known credential headers, which is why we leave
// logLevel at its default rather than cranking it to "debug" here.
import { TypeSafeClient } from '@typesafe-ai/sdk';

let client;

/**
 * @returns {TypeSafeClient}
 * @throws {Error} if JEV_API_KEY is not set — fails fast with a clear
 *   message rather than letting the SDK throw its own generic error deep
 *   inside a network call.
 */
export function getJevClient() {
  if (!client) {
    const apiKey = process.env.JEV_API_KEY;
    if (!apiKey) {
      throw new Error(
        'JEV_API_KEY is not set. The content quality gate (scripts/quality-gate.mjs) needs it — ' +
          'export JEV_API_KEY, or skip the gate and run build.mjs/render.mjs directly.'
      );
    }
    client = new TypeSafeClient({ apiKey });
  }
  return client;
}
