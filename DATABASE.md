# Database Setup

This project uses Supabase for authentication and database management.

## 📁 Database Structure

### Tables

- **auth.users** - Supabase auth users (automatically created)
- **public.profiles** - User profile information

### Key Features

- Row Level Security (RLS) enabled
- Automatic profile creation on user signup
- Timestamped records with auto-updating `updated_at`

## 🚀 Getting Started

### Fresh Setup

```bash
# Initialize Supabase (if not already done)
supabase init

# Start local development
supabase start

# Apply all migrations
supabase db reset
```

### Existing Project

```bash
# Start local development
supabase start

# Apply new migrations only
supabase db push
```

## 📋 Migration Files

- `20241011000001_initial_schema.sql` - Initial database setup with profiles table

## 🔑 Environment Variables

Local development uses `supabase/.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

## 🛠 Useful Commands

```bash
# Check database status
supabase status

# View database in browser
# Go to: http://127.0.0.1:54323

# Connect to database directly
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Generate types for TypeScript
supabase gen types typescript --local > types/supabase.ts
```

## 📊 Database Schema

### profiles table

```sql
Column     | Type                     | Description
-----------|--------------------------|------------------
id         | uuid (PK, FK to auth.users) | User ID
username   | text                     | Display username
full_name  | text                     | User's full name
website    | text                     | User's website URL
avatar_url | text                     | Profile picture URL
created_at | timestamptz              | Record creation time
updated_at | timestamptz              | Last update time
```

### RLS Policies

- Users can only view/edit their own profiles
- Automatic profile creation on user signup
- Secure by default
