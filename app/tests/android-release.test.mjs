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
  assert.ok(
    activeRules.includes('keystore.properties'),
    'Android .gitignore must actively ignore keystore.properties',
  )
})

test('Android release bundles require external upload signing credentials', async () => {
  const appGradle = await readAndroidFile('app/build.gradle')

  assert.match(appGradle, /CUOTIJI_KEYSTORE_PROPERTIES/)
  assert.match(appGradle, /\.android[\\/]cuotiji-upload[\\/]keystore\.properties/)
  for (const field of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
    assert.match(appGradle, new RegExp(`keystoreProperties\\[['"]${field}['"]\\]`))
  }
  assert.match(
    appGradle,
    /new File\(keystorePropertiesFile\.parentFile, keystoreProperties\[['"]storeFile['"]\]\)/,
  )
  assert.match(appGradle, /signingConfigs\s*{[\s\S]*release\s*{/)
  assert.match(appGradle, /buildTypes\s*{[\s\S]*release\s*{[\s\S]*signingConfig\s+signingConfigs\.release/)
  assert.match(appGradle, /Release signing requires/)
})

test('Gradle Wrapper uses the minimal verified release distribution', async () => {
  const wrapperProperties = await readAndroidFile(
    'gradle/wrapper/gradle-wrapper.properties',
  )

  assert.match(
    wrapperProperties,
    /^distributionUrl=https\\:\/\/downloads\.gradle\.org\/distributions\/gradle-8\.14\.3-bin\.zip$/m,
  )
  assert.match(
    wrapperProperties,
    /^distributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531$/m,
  )
  assert.match(wrapperProperties, /^networkTimeout=120000$/m)
})

test('Android build supports this repository Unicode path on Windows', async () => {
  const gradleProperties = await readAndroidFile('gradle.properties')

  assert.match(gradleProperties, /^android\.overridePathCheck=true$/m)
})
