import { OAuth2Client } from 'google-auth-library'

// Checks a Google ID token (the credential the "Sign in with Google" button
// hands the browser) and returns the verified claims. Google's library checks
// the signature against Google's public keys, that the token hasn't expired,
// and that it was issued for *our* client id -- so a token minted for some
// other app can't be used to sign in here. Throws if any of that fails.
export async function verifyGoogleToken(idToken, clientId, client = new OAuth2Client()) {
  const ticket = await client.verifyIdToken({ idToken, audience: clientId })
  return ticket.getPayload()
}

// Decides which account a verified Google sign-in belongs to:
//   1. an account already linked to this Google id -> that account
//   2. otherwise an account with the same email -> link it (Google has
//      verified the address, so this is the same person) and return it
//   3. otherwise create a new account with no password
// Returns null when Google hasn't verified the email: an unverified address
// could belong to someone else, and linking by email would hand them that
// person's account.
export async function resolveGoogleUser(prisma, claims) {
  const googleId = claims?.sub
  const email = String(claims?.email ?? '').trim().toLowerCase()

  if (!googleId || !email || claims.email_verified !== true) {
    return null
  }

  const linked = await prisma.user.findUnique({ where: { googleId } })
  if (linked) {
    return linked
  }

  const sameEmail = await prisma.user.findUnique({ where: { email } })
  if (sameEmail) {
    // An account already tied to a different Google account is never taken
    // over by another one
    if (sameEmail.googleId && sameEmail.googleId !== googleId) {
      return null
    }
    return prisma.user.update({ where: { id: sameEmail.id }, data: { googleId } })
  }

  return prisma.user.create({ data: { email, googleId } })
}
