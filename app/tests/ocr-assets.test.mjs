import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const tesseractRequire = createRequire(require.resolve("tesseract.js"));

test("prepares byte-identical local OCR resources and retained upstream notices", () => {
  const prepared = spawnSync(process.execPath, ["scripts/prepare-ocr-assets.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(prepared.status, 0, prepared.stderr);
  const output = path.join(root, "public/ocr/v1");
  const tesseract = path.dirname(require.resolve("tesseract.js/package.json"));
  const core = path.dirname(tesseractRequire.resolve("tesseract.js-core/package.json"));
  const pairs = [
    [path.join(tesseract, "dist/worker.min.js"), "worker.min.js"],
    [path.join(tesseract, "dist/worker.min.js.LICENSE.txt"), "worker.min.js.LICENSE.txt"],
    [path.join(tesseract, "LICENSE.md"), "licenses/tesseract.js.txt"],
    [path.join(core, "LICENSE"), "licenses/Apache-2.0.txt"],
    ...["lstm", "simd-lstm", "relaxedsimd-lstm"].map((variant) => [
      path.join(core, `tesseract-core-${variant}.wasm.js`),
      `core/tesseract-core-${variant}.wasm.js`,
    ]),
  ];
  for (const [source, destination] of pairs) {
    assert.deepEqual(readFileSync(path.join(output, destination)), readFileSync(source), destination);
  }
  for (const lang of ["chi_sim", "eng"]) {
    const source = path.join(path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`)), "4.0.0_best_int", `${lang}.traineddata.gz`);
    assert.deepEqual(readFileSync(path.join(output, `lang/${lang}.traineddata`)), gunzipSync(readFileSync(source)), lang);
    assert.equal(existsSync(path.join(output, `lang/${lang}.traineddata.gz`)), false);
  }
  const notice = readFileSync(path.join(output, "NOTICE.md"), "utf8");
  assert.match(notice, /naptha\/tessdata/);
  assert.match(notice, /4\.0\.0_best_int/);
  assert.match(notice, /tesseract\.js-core/);
});
