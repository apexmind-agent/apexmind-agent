import { PrismaClient } from '@prisma/client'
import { ensureEnvVars } from './env'

// Ensure DATABASE_URL is available before creating PrismaClient
ensureEnvVars()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
