#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tesseractRequire = createRequire(require.resolve("tesseract.js"));
const output = path.join(root, "public/ocr/v1");

function packageDirectory(resolver, name, version) {
  const metadata = resolver.resolve(`${name}/package.json`);
  const installed = JSON.parse(readFileSync(metadata, "utf8"));
  if (version && installed.version !== version) {
    throw new Error(`OCR assets require ${name}@${version}; found ${installed.version}`);
  }
  return path.dirname(metadata);
}

function copy(source, destination) {
  const target = path.join(output, destination);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target);
}

const tesseract = packageDirectory(require, "tesseract.js", "7.0.0");
const core = packageDirectory(tesseractRequire, "tesseract.js-core", "7.0.0");
copy(path.join(tesseract, "dist/worker.min.js"), "worker.min.js");
copy(path.join(tesseract, "dist/worker.min.js.LICENSE.txt"), "worker.min.js.LICENSE.txt");
copy(path.join(tesseract, "LICENSE.md"), "licenses/tesseract.js.txt");
copy(path.join(core, "LICENSE"), "licenses/Apache-2.0.txt");
// ponytail: only three LSTM builds are needed while OEM.LSTM_ONLY is fixed.
for (const variant of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  const filename = `tesseract-core-${variant}.wasm.js`;
  copy(path.join(core, filename), `core/${filename}`);
}
for (const lang of ["chi_sim", "eng"]) {
  const source = packageDirectory(require, `@tesseract.js-data/${lang}`, "1.0.0");
  const languageDirectory = path.join(output, "lang");
  mkdirSync(languageDirectory, { recursive: true });
  // Android aapt strips .gz from assets. Ship the same model uncompressed on every platform.
  writeFileSync(path.join(languageDirectory, `${lang}.traineddata`), gunzipSync(
    readFileSync(path.join(source, "4.0.0_best_int", `${lang}.traineddata.gz`)),
  ));
  rmSync(path.join(languageDirectory, `${lang}.traineddata.gz`), { force: true });
  copy(path.join(source, "package.json"), `licenses/${lang}-package.json`);
}
for (const [name, filename] of [
  ["bmp-js", "LICENSE"], ["idb-keyval", "LICENCE"], ["is-url", "LICENSE-MIT"],
  ["regenerator-runtime", "LICENSE"], ["wasm-feature-detect", "LICENSE"], ["zlibjs", "LICENSE"],
]) {
  copy(path.join(packageDirectory(tesseractRequire, name), filename), `licenses/${name}.txt`);
}
copy(path.join(root, "resources/ocr-NOTICE.md"), "NOTICE.md");
console.log("Prepared local OCR worker, three LSTM cores, Chinese/English models and upstream notices: public/ocr/v1");
