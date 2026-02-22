

# Migrating from Lovable Cloud to Appwrite

## The Situation

Your project currently runs on Lovable Cloud, which cannot be disconnected. You cannot access the underlying database through an external dashboard. However, I can help you **export everything you need** to rebuild on Appwrite.

## What You Have (Data Summary)

| Table | Records |
|-------|---------|
| tasks | 14 |
| goals | 3 |
| milestones | 5 |
| profiles | 1 |
| task_proofs | 1 |
| task_history | 1 |
| repeat_completions | 1 |
| subtasks, check_ins, work_sessions, etc. | 0 |

## Migration Plan

### Step 1: Export All Data as JSON

I will create a **Data Export page** in your app (e.g., `/export`) that:
- Queries all 12 tables from the database
- Displays the data as downloadable JSON files
- You can then import this JSON into Appwrite's database

### Step 2: Provide Complete Schema Documentation

I will create a **schema reference document** listing every table, column, type, and relationship so you can recreate the collections in Appwrite accurately.

### Step 3: Provide Appwrite Equivalents Guide

A mapping document showing how each Lovable Cloud feature maps to Appwrite:
- Database tables -> Appwrite Collections
- Authentication -> Appwrite Auth
- Edge Functions -> Appwrite Functions
- Storage buckets -> Appwrite Storage
- RLS policies -> Appwrite Permissions

### Step 4: Export Storage Files

The export page will also list files in the `proof-images` storage bucket with their URLs so you can download and re-upload them to Appwrite Storage.

## What You Will Get

1. A `/export` page with buttons to download all your data as JSON
2. A `MIGRATION_GUIDE.md` file with the full schema and Appwrite mapping
3. Storage file URLs for manual download

## Important Notes

- Lovable Cloud **cannot be disconnected** from this project
- After migration, you would need to build a **new project** with Appwrite as the backend (Lovable does not natively support Appwrite)
- The new Appwrite-based app would need to be built outside Lovable or with manual Appwrite SDK integration

## Technical Details

### New files to create:
- `src/pages/DataExport.tsx` - Export page with download buttons for all tables
- `MIGRATION_GUIDE.md` - Schema reference and Appwrite mapping

### Files to modify:
- `src/App.tsx` - Add route for `/export` page

