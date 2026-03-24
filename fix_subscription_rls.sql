-- =========================================================================
-- FIX: SUBSCRIPTION RLS POLICIES
-- Resolves 403 error when user tries to initiate checkout/subscription
-- =========================================================================

-- 1. Allow authenticated users to insert their own subscription records
-- This is required when the frontend calls .insert() to create a 'pending' transaction
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users can insert own subscriptions" 
ON public.user_subscriptions FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- 2. Ensure users can see their own subscriptions (already exists, but good to reinforce)
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users can view own subscriptions" 
ON public.user_subscriptions FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- 3. Ensure admins still have full access
DROP POLICY IF EXISTS "Admins can manage all subscriptions" ON public.user_subscriptions;
CREATE POLICY "Admins can manage all subscriptions" 
ON public.user_subscriptions FOR ALL 
TO authenticated 
USING (public.is_admin()) 
WITH CHECK (public.is_admin());

-- 4. (Optional) Allow users to update their own subscriptions 
-- Only if the status is 'pending' or 'cancelled' to avoid tampering with 'active' status
-- However, status updates should ideally be handled by service_role via Webhooks.
-- For safety, we keep UPDATE restricted to Admins/Service Role unless explicitly needed.
