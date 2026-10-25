-- Migration 020: store an explicit per-organization reminder schedule.
-- Existing reminders remain disabled unless an owner has enabled and acknowledged them.

ALTER TABLE public.organization_reminder_settings
  ADD COLUMN IF NOT EXISTS reminder_schedule text NOT NULL DEFAULT '3_days_before';

DO $$
BEGIN
  ALTER TABLE public.organization_reminder_settings
    ADD CONSTRAINT organization_reminder_schedule_check
    CHECK (reminder_schedule IN ('3_days_before', 'due_date', '7_days_overdue'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
