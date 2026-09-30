#!/usr/bin/env node
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "dist", "client");
const native = path.join(root, "dist", "native");
const clientIndex = path.join(client, "index.html");

if (!existsSync(clientIndex)) throw new Error("Missing native build input: " + clientIndex);

rmSync(native, { recursive: true, force: true });
cpSync(client, native, { recursive: true });

const nativeIndex = path.join(native, "index.html");
const html = readFileSync(nativeIndex, "utf8").replace(
  '<html lang="zh-CN">',
  '<html lang="zh-CN" data-native-shell="true">',
);
writeFileSync(nativeIndex, html);

console.log("Prepared Capacitor build: dist/native/index.html");
