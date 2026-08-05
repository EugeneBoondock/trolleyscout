import { copyFileSync, mkdirSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"

const root = process.cwd()
const outputDirectory = join(root, ".wrangler", "pages-functions")
const workerPath = join(root, "dist", "_worker.js")
const routesPath = join(root, "dist", "_routes.json")
const wranglerPath = join(root, "node_modules", "wrangler", "bin", "wrangler.js")

rmSync(outputDirectory, { recursive: true, force: true })
mkdirSync(outputDirectory, { recursive: true })

execFileSync(
  process.execPath,
  [
    wranglerPath,
    "pages",
    "functions",
    "build",
    "functions",
    "--outdir",
    outputDirectory,
    "--output-routes-path",
    routesPath,
    "--project-directory",
    root,
  ],
  { cwd: root, stdio: "inherit" },
)

copyFileSync(join(outputDirectory, "index.js"), workerPath)
