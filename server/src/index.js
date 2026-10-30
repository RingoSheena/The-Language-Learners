import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from './generated/prisma/client.ts'
import { hashPassword, verifyPassword } from './auth.js'
import { getEpubUploadProblem, MAX_EPUB_SIZE_BYTES } from './bookUpload.js'
import { cardReviewStats, summarizePractice } from './flashcardStats.js'
import { isValidTimeZone } from '../../shared/practiceDay.js'
import { GRADES, reviewCard } from '../../shared/srs.js'

const app = express()
const port = process.env.PORT || 3001

const SESSION_COOKIE = 'yomu_session'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const { JWT_SECRET } = process.env

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Add it to server/.env -- sessions cannot be signed without it.'
  )
}

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL,
})

const prisma = new PrismaClient({ adapter })

const upload = multer({
  storage: multer.memoryStorage(),
  // Browsers send file names as UTF-8; the default (latin1) garbles
  // Japanese titles like 猫.epub.
  defParamCharset: 'utf8',
  limits: {
    fileSize: MAX_EPUB_SIZE_BYTES,
    // The cover image arrives as a base64 data URL text field
    fieldSize: 10 * 1024 * 1024,
  },
})

// Translate Multer's upload errors into JSON the bookshelf can display.
function receiveEpubUpload(req, res, next) {
  upload.single('book')(req, res, (error) => {
    if (!error) return next()

    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE'
      return res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? 'This EPUB is too large. Please choose a file smaller than 25 MB.'
          : 'Unable to process this EPUB upload. Please try again.',
      })
    }

    next(error)
  })
}

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
)
app.use(express.json())
app.use(cookieParser())

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Yomu API is running.',
    endpoints: [
      '/api/health',
      '/api/login',
      '/api/register',
      '/api/logout',
      '/api/me',
      '/api/books',
      '/api/books/:id',
      '/api/books/:id/reading',
      '/api/books/:id/position',
      '/api/books/:id/bookmarks',
      '/api/books/:id/bookmarks/:bookmarkId',
      '/api/flashcards',
      '/api/flashcards/stats',
      '/api/flashcards/:id',
      '/api/flashcards/:id/review',
      '/api/flashcards/premade-reviews',
    ],
  })
})

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: '7d',
  })

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
  })
}

// Reads the session cookie set by /api/login and, if it's a valid,
// unexpired token, attaches req.user for downstream routes. Anything
// wrong with it (missing, expired, tampered) just leaves req.user unset --
// requireUser is what turns that into a 401, so routes that don't need
// a logged-in user can still use this to *optionally* know who's asking.
function attachUser(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE]

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      req.user = { id: payload.sub, email: payload.email }
    } catch {
      // Invalid or expired token -- treat the same as not logged in.
    }
  }

  next()
}

app.use(attachUser)

function requireUser(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({
      error: 'You must be logged in to do that.',
    })
  }

  next()
}

// Caps login and registration attempts per IP so passwords can't be
// guessed by brute force. Successful logins don't count toward the limit.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many attempts. Please wait 15 minutes and try again.',
  },
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const password = String(req.body.password ?? '')

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return res.status(409).json({ error: 'An account with that email already exists.' })
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
      },
    })

    res.status(201).json({
      message: 'Registration successful',
      user: { id: user.id, email: user.email },
    })
  } catch (error) {
    console.error('Register Error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const password = String(req.body.password ?? '')

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const passwordMatch = verifyPassword(password, user.passwordHash)

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    issueSession(res, user)

    res.status(200).json({
      message: 'Login successful',
      user: { id: user.id, email: user.email },
    })
  } catch (error) {
    console.error('Login Error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/api/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE)
  res.json({ message: 'Logged out' })
})

// Lets the client ask "who am I, if anyone" on load, instead of guessing
// from whatever it last wrote to localStorage.
app.get('/api/me', requireUser, (req, res) => {
  res.json({ user: req.user })
})

// Everything about a book except the EPUB file itself, which is only
// sent when the book is opened (GET /api/books/:id)
const BOOK_FIELDS = {
  id: true,
  title: true,
  fileName: true,
  coverImage: true,
  createdAt: true,
  lastOpenedAt: true,
  readingPosition: true,
}

// Save an EPUB to the logged-in user's account
app.post(
  '/api/books',
  requireUser,
  receiveEpubUpload,
  async (req, res) => {
    try {
      const problem = getEpubUploadProblem(req.file)
      if (problem) {
        return res.status(problem.status).json({ error: problem.error })
      }

      const title =
        req.body.title?.trim() ||
        req.file.originalname.replace(/\.epub$/i, '')

      const book = await prisma.book.create({
        data: {
          title,
          fileName: req.file.originalname,
          data: req.file.buffer,
          coverImage: req.body.coverImage?.startsWith('data:image/')
            ? req.body.coverImage
            : null,
          userId: req.user.id,
        },
        select: BOOK_FIELDS,
      })

      res.status(201).json(book)
    } catch (error) {
      console.error('Unable to save book:', error)

      res.status(500).json({
        error: 'The book could not be saved.',
      })
    }
  }
)

// Get the logged-in user's library
app.get('/api/books', requireUser, async (req, res) => {
  try {
    const books = await prisma.book.findMany({
      where: {
        userId: req.user.id,
      },
      select: BOOK_FIELDS,
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json(books)
  } catch (error) {
    console.error('Unable to load books:', error)

    res.status(500).json({
      error: 'Your library could not be loaded.',
    })
  }
})

// Load one EPUB belonging to the logged-in user
app.get('/api/books/:id', requireUser, async (req, res) => {
  try {
    const book = await prisma.book.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    })

    if (!book) {
      return res.status(404).json({
        error: 'Book not found.',
      })
    }

    res.setHeader('Content-Type', 'application/epub+zip')
    res.setHeader(
      'Content-Disposition',
      // filename* carries non-ASCII (e.g. Japanese) names; Node rejects
      // raw non-ASCII characters in headers.
      `inline; filename="book.epub"; filename*=UTF-8''${encodeURIComponent(book.fileName)}`
    )

    res.send(Buffer.from(book.data))
  } catch (error) {
    console.error('Unable to load book:', error)

    res.status(500).json({
      error: 'The book could not be loaded.',
    })
  }
})

// Rename a book, or record that it was just opened
app.patch('/api/books/:id', requireUser, async (req, res) => {
  try {
    const data = {}

    if (req.body.title !== undefined) {
      data.title = String(req.body.title).trim()

      if (!data.title) {
        return res.status(400).json({ error: 'A book needs a title.' })
      }
    }

    if (req.body.lastOpenedAt !== undefined) {
      data.lastOpenedAt = new Date(req.body.lastOpenedAt)

      if (Number.isNaN(data.lastOpenedAt.getTime())) {
        return res.status(400).json({ error: 'Invalid lastOpenedAt date.' })
      }
    }

    const owned = await prisma.book.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    })

    if (!owned) {
      return res.status(404).json({ error: 'Book not found.' })
    }

    const book = await prisma.book.update({
      where: { id: owned.id },
      data,
      select: BOOK_FIELDS,
    })

    res.json(book)
  } catch (error) {
    console.error('Unable to update book:', error)
    res.status(500).json({ error: 'The book could not be updated.' })
  }
})

// Remove a book from the logged-in user's library
app.delete('/api/books/:id', requireUser, async (req, res) => {
  try {
    const { count } = await prisma.book.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    })

    if (count === 0) {
      return res.status(404).json({ error: 'Book not found.' })
    }

    res.status(204).end()
  } catch (error) {
    console.error('Unable to delete book:', error)
    res.status(500).json({ error: 'The book could not be deleted.' })
  }
})

// A reading position is captured by the client (client/src/readingState.js)
// and only ever read back by it, so the server just checks it's a small
// object with a sane progress fraction.
const MAX_POSITION_BYTES = 4 * 1024

function readPosition(position) {
  const valid =
    position !== null &&
    typeof position === 'object' &&
    !Array.isArray(position) &&
    Number.isFinite(position.progress) &&
    position.progress >= 0 &&
    position.progress <= 1 &&
    JSON.stringify(position).length <= MAX_POSITION_BYTES

  return valid ? position : null
}

const BOOKMARK_FIELDS = {
  id: true,
  label: true,
  position: true,
  createdAt: true,
}

async function findOwnedBookId(req) {
  const book = await prisma.book.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: { id: true },
  })

  return book?.id ?? null
}

// Where the reader left off in a book, and its bookmarks
app.get('/api/books/:id/reading', requireUser, async (req, res) => {
  try {
    const book = await prisma.book.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: {
        readingPosition: true,
        bookmarks: { select: BOOKMARK_FIELDS, orderBy: { createdAt: 'asc' } },
      },
    })

    if (!book) {
      return res.status(404).json({ error: 'Book not found.' })
    }

    res.json({ position: book.readingPosition, bookmarks: book.bookmarks })
  } catch (error) {
    console.error('Unable to load reading state:', error)
    res.status(500).json({ error: 'Your reading progress could not be loaded.' })
  }
})

// Save where the reader is in a book
app.put('/api/books/:id/position', requireUser, async (req, res) => {
  try {
    const position = readPosition(req.body?.position)

    if (!position) {
      return res.status(400).json({ error: 'That reading position is not valid.' })
    }

    const { count } = await prisma.book.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { readingPosition: position },
    })

    if (count === 0) {
      return res.status(404).json({ error: 'Book not found.' })
    }

    res.status(204).end()
  } catch (error) {
    console.error('Unable to save reading position:', error)
    res.status(500).json({ error: 'Your reading progress could not be saved.' })
  }
})

// Bookmark a passage in a book
app.post('/api/books/:id/bookmarks', requireUser, async (req, res) => {
  try {
    const position = readPosition(req.body?.position)
    const label = String(req.body?.label ?? '').trim().slice(0, 200)

    if (!position || !label) {
      return res.status(400).json({ error: 'A bookmark needs a label and a position.' })
    }

    const bookId = await findOwnedBookId(req)

    if (!bookId) {
      return res.status(404).json({ error: 'Book not found.' })
    }

    const bookmark = await prisma.bookmark.create({
      data: { label, position, bookId },
      select: BOOKMARK_FIELDS,
    })

    res.status(201).json(bookmark)
  } catch (error) {
    console.error('Unable to save bookmark:', error)
    res.status(500).json({ error: 'The bookmark could not be saved.' })
  }
})

// Remove a bookmark
app.delete('/api/books/:id/bookmarks/:bookmarkId', requireUser, async (req, res) => {
  try {
    const { count } = await prisma.bookmark.deleteMany({
      where: {
        id: req.params.bookmarkId,
        book: { id: req.params.id, userId: req.user.id },
      },
    })

    if (count === 0) {
      return res.status(404).json({ error: 'Bookmark not found.' })
    }

    res.status(204).end()
  } catch (error) {
    console.error('Unable to delete bookmark:', error)
    res.status(500).json({ error: 'The bookmark could not be deleted.' })
  }
})

const FLASHCARD_FIELDS = {
  id: true,
  japanese: true,
  reading: true,
  definition: true,
  createdAt: true,
  updatedAt: true,
  dueAt: true,
  intervalDays: true,
  ease: true,
  streak: true,
  lapses: true,
  lastReviewedAt: true,
}

// Pulls the editable flashcard fields out of a request body as trimmed
// strings, leaving out anything the client didn't send so PATCH can
// update one field without blanking the others.
function readFlashcardFields(body = {}) {
  const fields = {}

  for (const key of ['japanese', 'reading', 'definition']) {
    if (body[key] !== undefined) {
      fields[key] = String(body[key]).trim()
    }
  }

  return fields
}

// Get the logged-in user's flashcards
app.get('/api/flashcards', requireUser, async (req, res) => {
  try {
    const reviewTotals = (where) =>
      prisma.reviewLog.groupBy({
        by: ['cardId'],
        where: { userId: req.user.id, cardId: { not: null }, ...where },
        _count: true,
        _avg: { durationMs: true },
      })

    const [flashcards, all, passed] = await Promise.all([
      prisma.flashcard.findMany({
        where: { userId: req.user.id },
        select: FLASHCARD_FIELDS,
        orderBy: { createdAt: 'desc' },
      }),
      reviewTotals({}),
      reviewTotals({ grade: { not: 'fail' } }),
    ])

    const byCard = (groups) => new Map(groups.map((group) => [group.cardId, group]))
    const allByCard = byCard(all)
    const passedByCard = byCard(passed)

    res.json(
      flashcards.map((card) => ({
        ...card,
        stats: cardReviewStats(card, allByCard.get(card.id), passedByCard.get(card.id)),
      }))
    )
  } catch (error) {
    console.error('Unable to load flashcards:', error)
    res.status(500).json({ error: 'Your flashcards could not be loaded.' })
  }
})

// Practice stats for the logged-in user: today, the past week, streak,
// retention, cards due soon, and a year of daily review counts. Days are the
// learner's local days (ending at 4am, see shared/practiceDay.js), so the
// client sends its time zone as ?timeZone=<IANA name>.
//
// Loads every review and buckets them in JS, since the day boundaries depend
// on the time zone. That's quick for years of daily practice; if accounts
// get far bigger, cache per-day counts instead.
app.get('/api/flashcards/stats', requireUser, async (req, res) => {
  try {
    const { timeZone } = req.query

    if (!isValidTimeZone(timeZone)) {
      return res.status(400).json({ error: 'A valid timeZone is required.' })
    }

    const [logs, cards] = await Promise.all([
      prisma.reviewLog.findMany({
        where: { userId: req.user.id },
        select: { reviewedAt: true, durationMs: true, grade: true, intervalDays: true },
      }),
      prisma.flashcard.findMany({
        where: { userId: req.user.id },
        select: { dueAt: true, intervalDays: true, lastReviewedAt: true },
      }),
    ])

    res.json(summarizePractice({ logs, cards, timeZone }))
  } catch (error) {
    console.error('Unable to load flashcard stats:', error)
    res.status(500).json({ error: 'Your practice stats could not be loaded.' })
  }
})

// Save a new flashcard to the logged-in user's account
app.post('/api/flashcards', requireUser, async (req, res) => {
  try {
    const { japanese, reading = '', definition } = readFlashcardFields(req.body)

    if (!japanese || !definition) {
      return res.status(400).json({
        error: 'A flashcard needs both a Japanese word and a definition.',
      })
    }

    const existing = await prisma.flashcard.findUnique({
      where: { userId_japanese: { userId: req.user.id, japanese } },
      select: FLASHCARD_FIELDS,
    })

    if (existing) {
      return res.status(409).json({
        error: 'This flashcard is already saved.',
        flashcard: existing,
      })
    }

    const flashcard = await prisma.flashcard.create({
      data: { japanese, reading, definition, userId: req.user.id },
      select: FLASHCARD_FIELDS,
    })

    res.status(201).json(flashcard)
  } catch (error) {
    console.error('Unable to save flashcard:', error)
    res.status(500).json({ error: 'The flashcard could not be saved.' })
  }
})

// Edit one of the logged-in user's flashcards
app.patch('/api/flashcards/:id', requireUser, async (req, res) => {
  try {
    const fields = readFlashcardFields(req.body)

    if (fields.japanese === '' || fields.definition === '') {
      return res.status(400).json({
        error: 'A flashcard needs both a Japanese word and a definition.',
      })
    }

    const owned = await prisma.flashcard.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    })

    if (!owned) {
      return res.status(404).json({ error: 'Flashcard not found.' })
    }

    const flashcard = await prisma.flashcard.update({
      where: { id: owned.id },
      data: fields,
      select: FLASHCARD_FIELDS,
    })

    res.json(flashcard)
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'You already have a flashcard for that word.',
      })
    }

    console.error('Unable to update flashcard:', error)
    res.status(500).json({ error: 'The flashcard could not be updated.' })
  }
})

// Answer times longer than this are counted as this long, so a card left
// on screen while the learner walks away doesn't inflate their time.
const MAX_REVIEW_DURATION_MS = 60 * 1000

function readReviewDuration(durationMs) {
  return Number.isFinite(durationMs)
    ? Math.round(Math.min(Math.max(durationMs, 0), MAX_REVIEW_DURATION_MS))
    : 0
}

// Grade a card. The client sends the grade and how long it took to answer;
// the new schedule is computed here from the saved card, with the same
// shared/srs.js the client uses for its interval previews. Each review is
// also logged for practice stats.
app.post('/api/flashcards/:id/review', requireUser, async (req, res) => {
  try {
    const { grade } = req.body ?? {}
    const durationMs = readReviewDuration(req.body?.durationMs)

    if (!GRADES.includes(grade)) {
      return res.status(400).json({ error: 'That review is not valid.' })
    }

    const card = await prisma.flashcard.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: FLASHCARD_FIELDS,
    })

    if (!card) {
      return res.status(404).json({ error: 'Flashcard not found.' })
    }

    const now = new Date()
    const schedule = reviewCard(card, grade, now)

    const [flashcard] = await prisma.$transaction([
      prisma.flashcard.update({
        where: { id: card.id },
        data: schedule,
        select: FLASHCARD_FIELDS,
      }),
      prisma.reviewLog.create({
        data: {
          grade,
          reviewedAt: now,
          durationMs,
          intervalDays: card.intervalDays,
          newIntervalDays: schedule.intervalDays,
          cardId: card.id,
          userId: req.user.id,
        },
      }),
    ])

    res.json(flashcard)
  } catch (error) {
    console.error('Unable to save review:', error)
    res.status(500).json({ error: 'Your review could not be saved.' })
  }
})

// Longest interval a premade deck review can report, about a century
const MAX_INTERVAL_DAYS = 36500

const readIntervalDays = (days) =>
  Number.isFinite(days) ? Math.min(Math.max(days, 0), MAX_INTERVAL_DAYS) : null

// Log a review of a premade deck card. Deck cards only live in the browser,
// so there's no card to update, but the review still counts toward the
// learner's stats and streak. The client sends the intervals it computed
// with shared/srs.js. Logs with no card are left out of per-card stats.
app.post('/api/flashcards/premade-reviews', requireUser, async (req, res) => {
  try {
    const { grade } = req.body ?? {}
    const intervalDays = readIntervalDays(req.body?.intervalDays)
    const newIntervalDays = readIntervalDays(req.body?.newIntervalDays)

    if (!GRADES.includes(grade) || intervalDays === null || newIntervalDays === null) {
      return res.status(400).json({ error: 'That review is not valid.' })
    }

    await prisma.reviewLog.create({
      data: {
        grade,
        durationMs: readReviewDuration(req.body?.durationMs),
        intervalDays,
        newIntervalDays,
        cardId: null,
        userId: req.user.id,
      },
    })

    res.status(204).end()
  } catch (error) {
    console.error('Unable to save premade deck review:', error)
    res.status(500).json({ error: 'Your review could not be saved.' })
  }
})

// Delete one of the logged-in user's flashcards
app.delete('/api/flashcards/:id', requireUser, async (req, res) => {
  try {
    const { count } = await prisma.flashcard.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    })

    if (count === 0) {
      return res.status(404).json({ error: 'Flashcard not found.' })
    }

    res.status(204).end()
  } catch (error) {
    console.error('Unable to delete flashcard:', error)
    res.status(500).json({ error: 'The flashcard could not be deleted.' })
  }
})

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})
