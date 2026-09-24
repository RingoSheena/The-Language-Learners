import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'

const app = express()
const port = process.env.PORT || 3001

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})

const prisma = new PrismaClient({ adapter })

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
})

app.use(cors())
app.use(express.json())

// This expects the authentication system to set req.user.
// Once the login ticket is connected, req.user.id should contain
// the currently logged-in user's database ID.
function requireUser(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({
      error: 'You must be logged in to access your books.',
    })
  }

  next()
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

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
          userId: req.user.id,
        },
        select: {
          id: true,
          title: true,
          fileName: true,
          createdAt: true,
        },
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
      select: {
        id: true,
        title: true,
        fileName: true,
        createdAt: true,
      },
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
      `inline; filename="${book.fileName}"`
    )

    res.send(Buffer.from(book.data))
  } catch (error) {
    console.error('Unable to load book:', error)

    res.status(500).json({
      error: 'The book could not be loaded.',
    })
  }
})

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})