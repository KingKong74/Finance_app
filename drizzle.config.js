// drizzle.config.js  (project root)
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema:    "./server_api/schema/index.js",
  out:       "./drizzle/migrations",
  dialect:   "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Verbose output during development
  verbose: true,
  strict:  true,
});