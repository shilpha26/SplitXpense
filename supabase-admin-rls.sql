-- Run this in Supabase SQL Editor to allow the admin to delete users from the app.
-- Replace 'saishilpha26@gmail.com' with your admin email if different.
-- The admin must be signed in (Supabase Auth) so their JWT is sent with requests.
-- Safe to run multiple times: drops existing policies first, then recreates them.

DROP POLICY IF EXISTS "Admin can delete users" ON public.users;
CREATE POLICY "Admin can delete users"
ON public.users FOR DELETE
USING (lower(trim((auth.jwt() ->> 'email')::text)) = 'saishilpha26@gmail.com');

DROP POLICY IF EXISTS "Admin can delete groups" ON public.groups;
CREATE POLICY "Admin can delete groups"
ON public.groups FOR DELETE
USING (lower(trim((auth.jwt() ->> 'email')::text)) = 'saishilpha26@gmail.com');

DROP POLICY IF EXISTS "Admin can update groups" ON public.groups;
CREATE POLICY "Admin can update groups"
ON public.groups FOR UPDATE
USING (lower(trim((auth.jwt() ->> 'email')::text)) = 'saishilpha26@gmail.com');

DROP POLICY IF EXISTS "Admin can delete expenses" ON public.expenses;
CREATE POLICY "Admin can delete expenses"
ON public.expenses FOR DELETE
USING (lower(trim((auth.jwt() ->> 'email')::text)) = 'saishilpha26@gmail.com');
