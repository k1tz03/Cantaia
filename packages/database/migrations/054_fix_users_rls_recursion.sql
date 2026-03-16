-- Migration 054: Fix infinite recursion in users table RLS policies
--
-- PROBLEM: The original SELECT policy on `users` references the `users` table
-- in its USING clause, causing PostgreSQL to evaluate the policy recursively:
--   USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()))
--   → reading `users` triggers the policy → infinite loop
--
-- FIX: Use a SECURITY DEFINER function that bypasses RLS to look up the
-- current user's organization_id. This breaks the recursion.
--
-- MUST BE APPLIED TO SUPABASE: Run this migration in the Supabase SQL editor.

-- Step 1: Create a helper function that runs with elevated privileges (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid()
$$;

-- Step 2: Drop the recursive policies
DROP POLICY IF EXISTS "Users see org members" ON public.users;
DROP POLICY IF EXISTS "Users update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can read own row" ON public.users;
DROP POLICY IF EXISTS "Users read own" ON public.users;

-- Step 3: Create non-recursive policies using the helper function

-- SELECT: Users can see all members of their organization
CREATE POLICY "Users see org members"
  ON public.users
  FOR SELECT
  USING (organization_id = public.get_user_org_id());

-- UPDATE: Users can only update their own row
CREATE POLICY "Users update own profile"
  ON public.users
  FOR UPDATE
  USING (id = auth.uid());

-- INSERT: Service role only (handled by admin client during registration)
-- No INSERT policy needed for regular users

-- Verify: Test the fix
-- SELECT * FROM users WHERE id = auth.uid();  -- Should work without recursion
