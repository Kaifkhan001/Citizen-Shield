# Database Schema — Milestone 2

This document describes the core domain schema for Citizen Shield. The source of truth is `packages/database/prisma/schema.prisma`; this file is a human-readable companion.

## Overview

Citizen Shield is a case-management system. The schema is normalized around a central `Case` aggregate that belongs to one `User` and may have any number of `Evidence`, `CaseTimeline` events, `Complaint` documents, and `AIConversation` exchanges.

```
┌────────┐ 1   N ┌─────────┐
│  User  │───────│  Case   │ N
└────────┘       └────┬────┘
                      │ N
        ┌─────────────┼─────────────────┬─────────────────┐
        ▼             ▼                 ▼                 ▼
   ┌──────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────────────┐
   │ Evidence │ │CaseTimeline│ │  Complaint   │ │ AIConversation   │
   └──────────┘ └────────────┘ └──────────────┘ └──────────────────┘
```

## Entities

### `User`

The system's identity aggregate. One user may own many cases.

| Field       | Type       | Notes                             |
| ----------- | ---------- | --------------------------------- |
| `id`        | `uuid`     | Primary key (`@default(uuid())`). |
| `email`     | `string`   | Unique. Indexed.                  |
| `name`      | `string`   | Display name.                     |
| `role`      | `UserRole` | `USER` (default) or `ADMIN`.      |
| `createdAt` | `DateTime` | Set on insert.                    |
| `updatedAt` | `DateTime` | Auto-updated.                     |

Indexes: `email` (unique + secondary), `role`.

### `Case`

The central aggregate. Everything in the system attaches to a case.

| Field         | Type           | Notes                                                  |
| ------------- | -------------- | ------------------------------------------------------ |
| `id`          | `uuid`         | Primary key.                                           |
| `title`       | `string`       | Short user-supplied title.                             |
| `description` | `string`       | Free-form long text.                                   |
| `category`    | `CaseCategory` | `CONSUMER_COMPLAINT` or `EMPLOYMENT_DISPUTE`.          |
| `status`      | `CaseStatus`   | Workflow state, defaults to `DRAFT`.                   |
| `userId`      | `uuid` (FK)    | Owning user. `onDelete: Restrict` — cannot drop user.  |
| `createdAt`   | `DateTime`     | Set on insert.                                         |
| `updatedAt`   | `DateTime`     | Auto-updated.                                          |
| `deletedAt`   | `DateTime?`    | Soft-delete tombstone. See Soft-delete strategy below. |

Indexes: `userId`, `category`, `status`, `deletedAt`.

### `Evidence`

References to files uploaded for a case. File binaries never live in Postgres — only metadata and a URL.

| Field       | Type        | Notes                                |
| ----------- | ----------- | ------------------------------------ |
| `id`        | `uuid`      | Primary key.                         |
| `caseId`    | `uuid` (FK) | Cascade on case delete.              |
| `fileName`  | `string`    | Original filename.                   |
| `fileType`  | `string`    | MIME or extension.                   |
| `fileUrl`   | `string`    | Pointer to object storage (S3 etc.). |
| `createdAt` | `DateTime`  | Set on insert.                       |
| `deletedAt` | `DateTime?` | Soft-delete tombstone.               |

Indexes: `caseId`, `deletedAt`.

### `CaseTimeline`

Append-only history of significant case events. No `updatedAt`, no `deletedAt` — events are immutable once written.

| Field         | Type                | Notes                                                |
| ------------- | ------------------- | ---------------------------------------------------- |
| `id`          | `uuid`              | Primary key.                                         |
| `caseId`      | `uuid` (FK)         | Cascade on case delete.                              |
| `eventType`   | `TimelineEventType` | Enum of the four canonical event types.              |
| `description` | `string`            | Human-readable summary.                              |
| `createdAt`   | `DateTime`          | Set on insert (also indexed for chronological sort). |

Indexes: `caseId`, `eventType`, `createdAt`.

### `Complaint`

Generated documents associated with a case (the actual letters/notices a user sends out).

| Field       | Type              | Notes                                       |
| ----------- | ----------------- | ------------------------------------------- |
| `id`        | `uuid`            | Primary key.                                |
| `caseId`    | `uuid` (FK)       | Cascade on case delete.                     |
| `type`      | `ComplaintType`   | Kind of document.                           |
| `content`   | `string` (text)   | Full document body.                         |
| `status`    | `ComplaintStatus` | Lifecycle (`DRAFT` → `GENERATED` → `SENT`). |
| `createdAt` | `DateTime`        | Set on insert.                              |
| `updatedAt` | `DateTime`        | Auto-updated.                               |
| `deletedAt` | `DateTime?`       | Soft-delete tombstone.                      |

Indexes: `caseId`, `status`, `deletedAt`.

### `AIConversation`

Persisted AI exchanges tied to a case. Stores the user message and assistant reply as plain text.

| Field              | Type        | Notes                   |
| ------------------ | ----------- | ----------------------- |
| `id`               | `uuid`      | Primary key.            |
| `caseId`           | `uuid` (FK) | Cascade on case delete. |
| `userMessage`      | `string`    | Prompt.                 |
| `assistantMessage` | `string`    | Reply.                  |
| `createdAt`        | `DateTime`  | Set on insert.          |

Indexes: `caseId`, `createdAt`.

## Enums

```prisma
enum UserRole         { USER, ADMIN }
enum CaseCategory     { CONSUMER_COMPLAINT, EMPLOYMENT_DISPUTE }
enum CaseStatus       { DRAFT, EVIDENCE_PENDING, READY_TO_FILE, FILED,
                        AWAITING_RESPONSE, ESCALATED, RESOLVED, CLOSED }
enum ComplaintType    { COMPLAINT, LEGAL_NOTICE, REMINDER, ESCALATION }
enum ComplaintStatus  { DRAFT, GENERATED, SENT }
enum TimelineEventType{ CASE_CREATED, EVIDENCE_UPLOADED,
                        COMPLAINT_GENERATED, STATUS_CHANGED }
```

## Relationships

| Relation               | From → To                           | On Delete  |
| ---------------------- | ----------------------------------- | ---------- |
| `Case.user`            | `Case.userId` → `User.id`           | `Restrict` |
| `Case.evidence`        | `Evidence.caseId` → `Case.id`       | `Cascade`  |
| `Case.timelineEvents`  | `CaseTimeline.caseId` → `Case.id`   | `Cascade`  |
| `Case.complaints`      | `Complaint.caseId` → `Case.id`      | `Cascade`  |
| `Case.aiConversations` | `AIConversation.caseId` → `Case.id` | `Cascade`  |

`Restrict` on `Case.userId` is deliberate: deleting a user should not silently destroy all their case history. Soft-deleting the case first (and resolving it as `CLOSED`) is the expected path.

## Indexes

Every foreign key is indexed. The following non-FK indexes exist for filtering or grouping:

| Table            | Index       | Purpose                                          |
| ---------------- | ----------- | ------------------------------------------------ |
| `User`           | `email`     | Unique + secondary for case-by-email lookups.    |
| `User`           | `role`      | Admin queries.                                   |
| `Case`           | `category`  | Filter dashboards.                               |
| `Case`           | `status`    | Workflow views.                                  |
| `Case`           | `deletedAt` | Excludes soft-deleted rows from default queries. |
| `Evidence`       | `deletedAt` | Same as above.                                   |
| `CaseTimeline`   | `eventType` | Filter by event kind.                            |
| `CaseTimeline`   | `createdAt` | Sort chronologically.                            |
| `Complaint`      | `status`    | Filter by document lifecycle.                    |
| `Complaint`      | `deletedAt` | Same as above.                                   |
| `AIConversation` | `createdAt` | Same as above.                                   |

## Soft-delete strategy

`Case`, `Evidence`, and `Complaint` carry a `deletedAt: DateTime?` column. `CaseTimeline` and `AIConversation` do **not** — those are audit/record artifacts that should remain once written, even if the underlying case is later soft-deleted.

Rules for using `deletedAt` (to be enforced at the application layer in M3+):

1. Reads filter by `deletedAt: null` by default. There is no global Prisma extension yet; the M3 repository/services layer should add it.
2. Writes never include `deletedAt` directly — set it via an explicit "soft delete" call.
3. Hard delete is reserved for GDPR-style right-to-be-forgotten flows and is **not** implemented in any milestone to date.

This keeps the door open for: legal hold, recovery workflows, audit-trail inspection, and analytics over historical cases.

## Future extension points

- **Audit log** — a separate `AuditLog` table (actor, action, entity, before/after JSON) can be added without touching existing models.
- **Notifications** — add a `Notification` model keyed to a `userId`, not a `caseId`, so user-level surfaces (badges, reminders) don't need to walk through cases.
- **Tagging** — add a `Tag` model with a join table `CaseTag(caseId, tagId)`. Avoids polymorphic tagging in MVP.
- **File storage metadata** — when object storage lands, add `sizeBytes`, `checksum`, `uploadedById` to `Evidence`. Don't denormalize files into Postgres.
- **AI conversation threading** — add `parentId: uuid?` to `AIConversation` once we need multi-turn context.
- **Case parties** — consumers, employers, etc. as a separate `Party` model with a join `CaseParty(caseId, partyId, role)`.
- **Versioning** — for `Complaint.content`, consider a `ComplaintRevision` table rather than rewriting `content` on every change.

## Migration

The initial migration lives at `packages/database/prisma/migrations/20260624000000_init_core_domain/migration.sql`. To apply:

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

(Seed inserts a development user so foreign-key constraints don't block manual exploration in Studio before authentication lands.)

## Notes for future milestones

- M3 will introduce a repository layer in `packages/database` (or directly in each domain module) that adds the default `deletedAt: null` filter — until then, callers must filter explicitly.
- M4+ should introduce a global Prisma middleware/extension for soft-delete so the rule above isn't repeated in every service.
- The `AIConversation` table is intentionally write-only (no `updatedAt`) — a new exchange creates a new row, never mutates.
