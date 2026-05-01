// Print the existing license-signing public key, or generate one if
// none exists. Use this in CI to bake the pubkey into the desktop
// client build env.

import { ensureKeys } from '../lib/jwt'

const { publicKeyPem } = ensureKeys()
process.stdout.write(publicKeyPem)
