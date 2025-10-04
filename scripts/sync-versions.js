#!/usr/bin/env node

/**
 * Synchronizes all package versions with the root package version
 * Run this after semantic-release updates the root version
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Read the root package.json to get the new version from semantic-release
const rootPkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const newVersion = rootPkg.version

console.log(`Synchronizing all packages to version ${newVersion}...`)

// Get all package directories from the monorepo
const packagesDir = 'packages'
const packages = readdirSync(packagesDir)

// Track how many packages we actually update
let updated = 0

// Loop through each package and update its version
for (const pkg of packages) {
  const pkgJsonPath = join(packagesDir, pkg, 'package.json')
  try {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))

    // Only update if the version is different
    if (pkgJson.version !== newVersion) {
      console.log(`  ${pkg}: ${pkgJson.version} → ${newVersion}`)
      pkgJson.version = newVersion
      // Write with proper formatting (2 spaces, trailing newline)
      writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')
      updated++
    } else {
      console.log(`  ${pkg}: already at ${newVersion}`)
    }
  } catch (err) {
    // Skip packages that don't have a package.json (e.g., config is spec-only)
    console.warn(`  ${pkg}: skipped (${err.message})`)
  }
}

console.log(`\nSynchronized ${updated} package(s)`)
