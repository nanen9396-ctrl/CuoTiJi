# Bundled OCR resources

These files are unmodified third-party resources, not original 题仓 code.

| Resource | Source and version | License information |
| --- | --- | --- |
| worker.min.js | https://github.com/naptha/tesseract.js — 7.0.0 | Apache-2.0; see licenses/tesseract.js.txt and worker.min.js.LICENSE.txt |
| Three LSTM core *.wasm.js files | https://github.com/naptha/tesseract.js-core — 7.0.0 | Apache-2.0 for the package; see licenses/Apache-2.0.txt and upstream dependency note below |
| chi_sim / eng traineddata | https://github.com/naptha/tessdata — 4.0.0_best_int, npm @tesseract.js-data/chi_sim and /eng 1.0.0 | The upstream data repository supplies Apache-2.0; its full text is licenses/Apache-2.0.txt. npm wrapper metadata declares MIT and is preserved in licenses/*-package.json. |

The gzip models match upstream commit `806cd9adc8c6e8abc11c782db1818c990576bebc`:

- chi_sim: 1,718,768 bytes; Git blob SHA-1 `7defede2087a726a0f01a8f9b3b9c092c12160cc`.
- eng: 2,952,873 bytes; Git blob SHA-1 `730a6a59010b9440e38dd85f9fe6b6bf0637e6eb`.

The build only decompresses these gzip files to `.traineddata`; model contents are unchanged. This avoids Android aapt's automatic `.gz` decompression/renaming. The loader uses `gzip: false` and the same filenames in web and native builds.

The worker's upstream extracted notices and locally installed licenses for bmp-js, idb-keyval, is-url, regenerator-runtime, wasm-feature-detect and zlibjs are retained. The worker also includes buffer, base64-js and ieee754; the extracted notice is not a substitute for auditing every bundled dependency's full attribution.

The compiled core contains upstream native dependencies, including Leptonica and image codecs, whose attribution must also be reviewed before commercial redistribution. See https://github.com/naptha/tesseract.js-core/issues/44 and the corresponding upstream sources. This file records known provenance and retained notices; it is not a claim that the entire application's commercial licensing audit is complete.
