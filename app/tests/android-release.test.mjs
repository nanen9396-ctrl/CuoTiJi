import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const androidRoot = new URL('../android/', import.meta.url)

async function readAndroidFile(relativePath) {
  return readFile(new URL(relativePath, androidRoot), 'utf8')
}

test('Android release identity and SDK levels stay store-ready', async () => {
  const [appGradle, variablesGradle] = await Promise.all([
    readAndroidFile('app/build.gradle'),
    readAndroidFile('variables.gradle'),
  ])

  assert.match(appGradle, /applicationId\s+["']com\.nanen9396\.cuotiji["']/)
  assert.match(appGradle, /versionCode\s+1\b/)
  assert.match(appGradle, /versionName\s+["']1\.0["']/)
  assert.match(variablesGradle, /minSdkVersion\s*=\s*24\b/)
  assert.match(variablesGradle, /compileSdkVersion\s*=\s*36\b/)
  assert.match(variablesGradle, /targetSdkVersion\s*=\s*36\b/)
})

test('Android signing secrets cannot be committed accidentally', async () => {
  const gitignore = await readAndroidFile('.gitignore')
  const activeRules = gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  assert.ok(activeRules.includes('*.jks'), 'Android .gitignore must actively ignore *.jks')
  assert.ok(
    activeRules.includes('*.keystore'),
    'Android .gitignore must actively ignore *.keystore',
  )
})
