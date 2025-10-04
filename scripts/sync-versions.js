#!/usr/bin/env node

/**
 * Synchronizes all package versions with the root package version
 * Run this after semantic-release updates the root version
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const rootPkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const newVersion = rootPkg.version

console.log(`Synchronizing all packages to version ${newVersion}...`)

const packagesDir = 'packages'
const packages = readdirSync(packagesDir)

let updated = 0
for (const pkg of packages) {
  const pkgJsonPath = join(packagesDir, pkg, 'package.json')
  try {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))

    if (pkgJson.version !== newVersion) {
      console.log(`  ${pkg}: ${pkgJson.version} → ${newVersion}`)
      pkgJson.version = newVersion
      writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')
      updated++
    } else {
      console.log(`  ${pkg}: already at ${newVersion}`)
    }
  } catch (err) {
    console.warn(`  ${pkg}: skipped (${err.message})`)
  }
}

console.log(`\nSynchronized ${updated} package(s)`)
