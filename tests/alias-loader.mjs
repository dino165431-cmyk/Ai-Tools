import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = process.cwd()
const srcRoot = path.join(projectRoot, 'src')

function tryResolvePath(basePath) {
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.mjs`,
    `${basePath}.json`,
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs')
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith('@/')) {
    const absolutePath = tryResolvePath(path.join(srcRoot, specifier.slice(2)))
    if (absolutePath) {
      return {
        url: pathToFileURL(absolutePath).href,
        shortCircuit: true
      }
    }
  }

  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file://')) {
    const parentPath = path.dirname(fileURLToPath(context.parentURL))
    const absolutePath = tryResolvePath(path.resolve(parentPath, specifier))
    if (absolutePath) {
      return {
        url: pathToFileURL(absolutePath).href,
        shortCircuit: true
      }
    }
  }
  return defaultResolve(specifier, context, defaultResolve)
}
