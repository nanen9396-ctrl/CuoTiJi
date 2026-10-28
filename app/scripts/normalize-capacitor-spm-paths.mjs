#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageFile = path.join(root, "ios", "App", "CapApp-SPM", "Package.swift");
const source = readFileSync(packageFile, "utf8");
const normalized = source.replace(/path:\s*"[^"]*"/g, (declaration) => declaration.replaceAll("\\", "/"));

if (normalized !== source) writeFileSync(packageFile, normalized);

console.log("Normalized Capacitor Swift package paths.");
