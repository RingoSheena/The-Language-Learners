import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveGoogleUser, verifyGoogleToken } from './google.js'

// A tiny in-memory stand-in for the parts of Prisma that resolveGoogleUser uses
function fakePrisma(users = []) {
  let nextId = 1
  return {
    users,
    user: {
      findUnique: async ({ where }) =>
        users.find((u) => Object.entries(where).every(([k, v]) => u[k] === v)) ?? null,
      update: async ({ where, data }) => {
        const user = users.find((u) => u.id === where.id)
        for (const [key, value] of Object.entries(data)) {
          user[key] = value?.increment !== undefined ? (user[key] ?? 0) + value.increment : value
        }
        return user
      },
      create: async ({ data }) => {
        const user = { id: `new-${nextId++}`, passwordHash: null, googleId: null, ...data }
        users.push(user)
        return user
      },
    },
  }
}

const claims = (overrides = {}) => ({
  sub: 'google-123',
  email: 'Learner@Example.com',
  email_verified: true,
  ...overrides,
})

test('creates a password-less account for a new Google user', async () => {
  const prisma = fakePrisma()
  const user = await resolveGoogleUser(prisma, claims())
  assert.equal(user.email, 'learner@example.com')
  assert.equal(user.googleId, 'google-123')
  assert.equal(user.passwordHash, null)
  assert.equal(prisma.users.length, 1)
})

test('signs in to the account already linked to that Google id', async () => {
  const prisma = fakePrisma([{ id: 'u1', email: 'old@example.com', googleId: 'google-123' }])
  const user = await resolveGoogleUser(prisma, claims({ email: 'changed@example.com' }))
  assert.equal(user.id, 'u1')
  assert.equal(prisma.users.length, 1)
})

test('links Google to an existing password account with the same email', async () => {
  const prisma = fakePrisma([
    { id: 'u1', email: 'learner@example.com', passwordHash: 'salt:key', googleId: null, sessionVersion: 0 },
  ])
  const user = await resolveGoogleUser(prisma, claims())
  assert.equal(user.id, 'u1')
  assert.equal(user.googleId, 'google-123')
  assert.equal(prisma.users.length, 1)
})

// Registration doesn't confirm emails, so whoever set this password may not
// own the address. Linking must lock them out: no password, no old sessions.
test('linking removes the password and ends existing sessions', async () => {
  const prisma = fakePrisma([
    { id: 'u1', email: 'learner@example.com', passwordHash: 'salt:key', googleId: null, sessionVersion: 3 },
  ])
  const user = await resolveGoogleUser(prisma, claims())
  assert.equal(user.passwordHash, null)
  assert.equal(user.sessionVersion, 4)
})

test('signing in again with a linked Google account keeps its sessions', async () => {
  const prisma = fakePrisma([
    { id: 'u1', email: 'learner@example.com', passwordHash: null, googleId: 'google-123', sessionVersion: 1 },
  ])
  const user = await resolveGoogleUser(prisma, claims())
  assert.equal(user.sessionVersion, 1)
})

test('refuses an email Google has not verified', async () => {
  const prisma = fakePrisma([{ id: 'u1', email: 'learner@example.com', googleId: null }])
  assert.equal(await resolveGoogleUser(prisma, claims({ email_verified: false })), null)
  assert.equal(await resolveGoogleUser(prisma, claims({ email_verified: undefined })), null)
  assert.equal(prisma.users[0].googleId, null)
})

test('never moves an account that belongs to a different Google account', async () => {
  const prisma = fakePrisma([
    { id: 'u1', email: 'learner@example.com', googleId: 'someone-else' },
  ])
  assert.equal(await resolveGoogleUser(prisma, claims()), null)
  assert.equal(prisma.users[0].googleId, 'someone-else')
})

test('refuses claims with no id or email', async () => {
  const prisma = fakePrisma()
  assert.equal(await resolveGoogleUser(prisma, claims({ sub: undefined })), null)
  assert.equal(await resolveGoogleUser(prisma, claims({ email: '' })), null)
  assert.equal(await resolveGoogleUser(prisma, null), null)
  assert.equal(prisma.users.length, 0)
})

test('verifyGoogleToken checks the token against our client id', async () => {
  let received
  const client = {
    verifyIdToken: async (options) => {
      received = options
      return { getPayload: () => ({ sub: 'google-123' }) }
    },
  }
  const payload = await verifyGoogleToken('the-token', 'our-client-id', client)
  assert.deepEqual(received, { idToken: 'the-token', audience: 'our-client-id' })
  assert.equal(payload.sub, 'google-123')
})

test('verifyGoogleToken passes Google\'s rejection through', async () => {
  const client = { verifyIdToken: async () => { throw new Error('Wrong recipient') } }
  await assert.rejects(verifyGoogleToken('bad', 'our-client-id', client), /Wrong recipient/)
})
