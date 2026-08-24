# Wrongbook Data Management Design

**Date:** 2026-08-24  
**Status:** Approved for implementation planning  
**Scope:** Local search, edit, delete, full backup import/export, and clear-all operations.

## Goal

Give users complete control of their local wrong-question library before store release. Users can find and correct saved questions, remove individual records, create a restorable backup that includes original images, import that backup without overwriting newer local edits, and intentionally clear all local data.

## Non-Goals

- Account login, cloud synchronization, and multi-device conflict resolution.
- Password-encrypted backups.
- Replacing the original image while editing a saved question.
- A recycle bin or soft-delete system.
- Semantic duplicate detection when two questions have different IDs.
- Migrating images into a separate IndexedDB object store.
- Adding Capacitor filesystem or sharing plugins.

## Selected Approach

Keep the existing single `questions` IndexedDB object store. Add the minimum CRUD and atomic-import operations to the current store module. Put backup serialization and validation in one dependency-free module. Use the platform file picker, Web Share API, and anchor-download fallback so the same implementation works in the browser and Capacitor WebView.

This approach was selected over splitting metadata and images into separate stores or adding native filesystem plugins. Those alternatives provide more headroom but introduce migrations, platform-specific permissions, and additional dependencies before the product demonstrates that it needs them.

## User Experience

### Search

Each library screen has one search field above its question list. Matching is case-insensitive and searches the prompt, answer, note, target, subject, and question type. The filter runs locally as the user types. Empty search text restores the complete current library. Results remain ordered by creation time from newest to oldest.

### View and edit a question

Selecting a question row opens a detail screen containing the original image and editable prompt, answer, note, target, subject, and question type. Saving uses the existing question ID, image, and creation timestamp. The screen reports a database failure and remains editable if the update transaction does not complete.

The original image cannot be replaced in this release. A user who needs a different image deletes the question and records it again.

### Delete one question

The detail screen provides a delete action. Before deleting, the app asks for confirmation and includes a short prompt excerpt. The record disappears from memory only after the IndexedDB delete transaction completes. There is no recycle bin or undo after confirmation.

### Data management

The home screen provides a `数据管理` entry. Its screen shows the current number of questions and three actions: export backup, import backup, and clear all data. Status text reports completed operations and recoverable errors.

### Clear all data

Clearing uses two confirmation prompts. The second prompt states the exact number of questions that will be removed. The in-memory library becomes empty only after the IndexedDB clear transaction completes. Cancellation or transaction failure leaves all records unchanged.

## Backup Format

The exported filename ends in `.cuotiji.json` and contains UTF-8 JSON with this top-level shape:

```json
{
  "format": "cuotiji",
  "version": 1,
  "exportedAt": "2026-08-24T00:00:00.000Z",
  "questions": []
}
```

Each question contains its ID, prompt, answer, target, subject, question type, note, creation timestamp, and image. The image is represented by its MIME type and Base64 bytes. Export never sends content to a server.

Before export, the app explains that the file contains original photographs and personal notes and is not encrypted. If the generated file exceeds 100 MB, export stops with an explanatory message. This ensures every produced backup is within the supported import limit.

When the platform supports sharing files, the app opens the system share sheet. Otherwise it downloads the same `.cuotiji.json` file with an object URL and temporary anchor.

## Import Rules

The user chooses one `.cuotiji.json` file using the platform file picker. Files larger than 100 MB are rejected before reading. Parsing and validation finish before any database write begins.

Validation requires:

- top-level format `cuotiji` and version `1`;
- an array of questions;
- non-empty string IDs and prompts;
- string answer, target, subject, and note fields;
- one of the supported question types;
- a valid creation timestamp;
- an image MIME type beginning with `image/`;
- valid Base64 image content.

Unknown versions, malformed JSON, invalid fields, or invalid images produce a clear error and do not modify IndexedDB.

After validation, import reads the existing question IDs. A backup item whose ID already exists is skipped so a local edit is never overwritten. All remaining questions are inserted in one read-write transaction. Any request, quota, or transaction error aborts the whole batch. The result reports the number added and the number skipped.

## Data and Component Boundaries

### `wrongbook-store.ts`

Owns IndexedDB operations and transaction success boundaries. It will expose update, delete, clear, and atomic batch-import operations alongside the existing list and add operations. It does not parse files or render messages.

### `wrongbook-backup.ts`

Owns the versioned wire format, Blob-to-Base64 conversion, Base64-to-Blob conversion, schema validation, and the 100 MB limit. Its conversion functions are testable without IndexedDB and do not initiate downloads or sharing.

### `Prototype.tsx`

Owns user interaction and session state. It filters current questions for search, opens detail and data-management screens, calls the store and backup modules, and updates in-memory state only after durable writes succeed. It uses native file input, confirmation, sharing, and download APIs rather than adding UI or filesystem dependencies.

## Error Handling

- Empty search is a normal unfiltered state.
- Failed updates and deletes preserve the current screen and record.
- Export encoding or size failure creates no file.
- Import size, parsing, format, version, field, or image failure creates no database transaction.
- Import database failure rolls back every new record in the batch.
- Clear failure preserves the in-memory list and reports an error.
- The application never claims success before the corresponding IndexedDB transaction completes.

## Accessibility

- Search has a visible label or accessible name.
- Question rows are keyboard-operable buttons rather than click-only articles.
- Edit fields retain associated labels.
- Destructive actions have explicit names and confirmation text.
- Operation status and errors use appropriate live status or alert semantics.

## Verification

Unit tests cover:

- a question with an image surviving export and import unchanged;
- top-level format and version validation;
- required field and supported question-type validation;
- rejection of non-image MIME types and invalid Base64;
- the 100 MB boundary.

IndexedDB/browser-boundary tests cover:

- update, single delete, clear, and durable transaction completion;
- duplicate-ID skipping;
- atomic rollback when a batch import transaction aborts.

End-to-end browser tests cover:

- searching across all approved fields;
- editing a question without changing its ID, image, or creation time;
- single-delete confirmation and cancellation;
- export privacy confirmation and file creation;
- importing a valid full backup and reporting added/skipped counts;
- rejecting invalid import files without data loss;
- double-confirmed clear and cancellation.

Regression verification retains model classification, OCR lifecycle, native configuration, protected mobile runtime, Sites build logic, TypeScript, production build, and whitespace checks.

## Acceptance Criteria

- Every saved question can be found, opened, edited, and individually deleted.
- A successful export contains every question field and the original image.
- A successful import restores valid questions, skips duplicate IDs, and never overwrites local records.
- Invalid or failed imports leave the library unchanged.
- Clear-all cannot run without two confirmations and does not update the UI before durable completion.
- No network request, new runtime dependency, native permission, or protected mobile-runtime modification is introduced.
