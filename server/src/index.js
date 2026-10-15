import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from './generated/prisma/client.ts'
import { hashPassword, verifyPassword } from './auth.js'

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
    fileSize: 25 * 1024 * 1024,
    // The cover image arrives as a base64 data URL text field
    fieldSize: 10 * 1024 * 1024,
  },
})

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
      '/api/flashcards',
      '/api/flashcards/:id',
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/register', async (req, res) => {
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

app.post('/api/login', async (req, res) => {
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
}

// Save an EPUB to the logged-in user's account
app.post(
  '/api/books',
  requireUser,
  upload.single('book'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Please select an EPUB file.',
        })
      }

      const isEpub =
        req.file.originalname.toLowerCase().endsWith('.epub') ||
        req.file.mimetype === 'application/epub+zip'

      if (!isEpub) {
        return res.status(400).json({
          error: 'Only EPUB files can be uploaded.',
        })
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

const FLASHCARD_FIELDS = {
  id: true,
  japanese: true,
  reading: true,
  definition: true,
  createdAt: true,
  updatedAt: true,
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
    const flashcards = await prisma.flashcard.findMany({
      where: { userId: req.user.id },
      select: FLASHCARD_FIELDS,
      orderBy: { createdAt: 'desc' },
    })

    res.json(flashcards)
  } catch (error) {
    console.error('Unable to load flashcards:', error)
    res.status(500).json({ error: 'Your flashcards could not be loaded.' })
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
