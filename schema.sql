-- ====================================================
-- SUPABASE POSTGRESQL SCHEMA FOR TASK & CASHBACK WEB APP
-- Run this in the Supabase SQL Editor
-- ====================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT UNIQUE,
    avatar_url TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ADMIN USERS TABLE
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin', 'editor')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TASKS TABLE
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('bKash', 'Nagad')),
    payment_number TEXT NOT NULL,
    payment_amount NUMERIC(12,2) NOT NULL CHECK (payment_amount > 0),
    bonus_amount NUMERIC(12,2) NOT NULL CHECK (bonus_amount >= 0),
    refund_min_minutes INTEGER DEFAULT 10,
    refund_max_minutes INTEGER DEFAULT 30,
    instructions TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    daily_limit INTEGER DEFAULT 0, -- 0 means unlimited
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TASK SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.task_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
    payment_id UUID, -- Foreign key defined later after payments table is created
    sender_number TEXT NOT NULL,
    transaction_id TEXT NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL,
    screenshot_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'verified', 'refund_pending', 'refunded', 'rejected', 'cancelled')),
    admin_note TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
    submission_id UUID REFERENCES public.task_submissions(id) ON DELETE SET NULL,
    sender_number TEXT NOT NULL,
    receiver_number TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    transaction_id TEXT NOT NULL UNIQUE,
    payment_method TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);

-- Add constraint linking payment_id to task_submissions
ALTER TABLE public.task_submissions 
ADD CONSTRAINT fk_task_submissions_payment 
FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;

-- 6. REFUNDS TABLE
CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    task_submission_id UUID NOT NULL REFERENCES public.task_submissions(id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL,
    refund_number TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'refunded', 'failed')),
    admin_note TEXT,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. WALLET TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('bonus', 'withdrawal', 'adjustment', 'reversal')),
    amount NUMERIC(12,2) NOT NULL, -- Negative for withdrawals, positive for bonuses
    reference_type TEXT CHECK (reference_type IN ('refund', 'withdrawal', 'admin_adjustment')),
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure a user only receives one bonus per task submission/refund
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_bonus_uniq ON public.wallet_transactions (reference_id, type) WHERE (type = 'bonus');

-- 8. WITHDRAWALS TABLE
CREATE TABLE IF NOT EXISTS public.withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('bKash', 'Nagad')),
    account_number TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 100),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'rejected', 'cancelled')),
    admin_note TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. APP SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.app_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
    min_withdrawal NUMERIC(12,2) DEFAULT 100,
    max_withdrawal NUMERIC(12,2) DEFAULT 10000,
    support_contact TEXT DEFAULT '+8801700000000',
    maintenance_mode BOOLEAN DEFAULT FALSE,
    task_availability BOOLEAN DEFAULT TRUE,
    default_refund_message TEXT DEFAULT 'Your refund has been manually processed to your wallet/mobile number.',
    default_task_instructions TEXT DEFAULT 'Please send the exact amount to our receiver number and enter details.',
    global_bkash_number TEXT DEFAULT '01780647586',
    global_nagad_number TEXT DEFAULT '01892736004',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default app settings
INSERT INTO public.app_settings (id, global_bkash_number, global_nagad_number) VALUES (TRUE, '01780647586', '01892736004') ON CONFLICT DO NOTHING;


-- ====================================================
-- TRIGGERS AND SYSTEM FUNCTIONS
-- ====================================================

-- Profile auto-creation on Auth Sign Up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email, avatar_url, status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'New User'),
    new.raw_user_meta_data->>'phone',
    new.email,
    new.raw_user_meta_data->>'avatar_url',
    'active'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Prevent users from updating their own status
CREATE OR REPLACE FUNCTION public.check_profile_update()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_profile_update();


-- ====================================================
-- HELPER FUNCTIONS FOR SECURITY AND BALANCES
-- ====================================================

-- Check if user is an admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.admin_users WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate user wallet balance from ledger
CREATE OR REPLACE FUNCTION public.get_user_balance(user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    bal NUMERIC;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO bal
    FROM public.wallet_transactions
    WHERE wallet_transactions.user_id = $1;
    RETURN bal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ====================================================
-- SECURE TRANSACTIONAL PROCEDURES (SECURITY DEFINER)
-- ====================================================

-- 1. Create a withdrawal request and reserve funds
CREATE OR REPLACE FUNCTION public.request_withdrawal(
    p_amount NUMERIC,
    p_method TEXT,
    p_account_number TEXT
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_balance NUMERIC;
    v_withdrawal_id UUID;
    v_min_withdraw NUMERIC;
    v_max_withdraw NUMERIC;
    v_profile_status TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check profile status
    SELECT status INTO v_profile_status FROM public.profiles WHERE id = v_user_id;
    IF v_profile_status != 'active' THEN
        RAISE EXCEPTION 'Account is not active';
    END IF;

    -- Get settings
    SELECT min_withdrawal, max_withdrawal INTO v_min_withdraw, v_max_withdraw FROM public.app_settings WHERE id = TRUE;
    IF p_amount < v_min_withdraw THEN
        RAISE EXCEPTION 'Minimum withdrawal amount is ৳%', v_min_withdraw;
    END IF;
    IF p_amount > v_max_withdraw THEN
        RAISE EXCEPTION 'Maximum withdrawal amount is ৳%', v_max_withdraw;
    END IF;

    -- Check current balance
    v_balance := public.get_user_balance(v_user_id);
    IF v_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Check duplicate pending withdrawal
    IF EXISTS (SELECT 1 FROM public.withdrawals WHERE user_id = v_user_id AND status = 'pending') THEN
        RAISE EXCEPTION 'You already have a pending withdrawal request';
    END IF;

    -- Insert withdrawal request
    INSERT INTO public.withdrawals (user_id, method, account_number, amount, status)
    VALUES (v_user_id, p_method, p_account_number, p_amount, 'pending')
    RETURNING id INTO v_withdrawal_id;

    -- Immediately deduct/reserve from wallet
    INSERT INTO public.wallet_transactions (user_id, type, amount, reference_type, reference_id, description)
    VALUES (v_user_id, 'withdrawal', -p_amount, 'withdrawal', v_withdrawal_id, 'Deducted for withdrawal request');

    RETURN v_withdrawal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Verify task payment submission
CREATE OR REPLACE FUNCTION public.admin_verify_payment(
    p_submission_id UUID,
    p_admin_note TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_sub RECORD;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Admin role required';
    END IF;

    SELECT * INTO v_sub FROM public.task_submissions WHERE id = p_submission_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task submission not found';
    END IF;

    IF v_sub.status != 'pending' AND v_sub.status != 'under_review' THEN
        RAISE EXCEPTION 'Submission is not in a verifiable state';
    END IF;

    -- Update submission status to 'refund_pending'
    UPDATE public.task_submissions
    SET status = 'refund_pending',
        verified_at = NOW(),
        admin_note = p_admin_note,
        updated_at = NOW()
    WHERE id = p_submission_id;

    -- Update linked payment status
    IF v_sub.payment_id IS NOT NULL THEN
        UPDATE public.payments
        SET status = 'verified',
            verified_at = NOW()
        WHERE id = v_sub.payment_id;
    ELSE
        UPDATE public.payments
        SET status = 'verified',
            verified_at = NOW(),
            submission_id = p_submission_id
        WHERE transaction_id = v_sub.transaction_id;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Reject task payment submission
CREATE OR REPLACE FUNCTION public.admin_reject_payment(
    p_submission_id UUID,
    p_admin_note TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_sub RECORD;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Admin role required';
    END IF;

    SELECT * INTO v_sub FROM public.task_submissions WHERE id = p_submission_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task submission not found';
    END IF;

    IF v_sub.status != 'pending' AND v_sub.status != 'under_review' THEN
        RAISE EXCEPTION 'Submission is not in review';
    END IF;

    UPDATE public.task_submissions
    SET status = 'rejected',
        admin_note = p_admin_note,
        updated_at = NOW()
    WHERE id = p_submission_id;

    UPDATE public.payments
    SET status = 'rejected'
    WHERE transaction_id = v_sub.transaction_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Mark refund complete and credit task bonus (exactly once)
CREATE OR REPLACE FUNCTION public.admin_mark_refunded(
    p_submission_id UUID,
    p_refund_number TEXT,
    p_admin_note TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_sub RECORD;
    v_task RECORD;
    v_refund_id UUID;
    v_referrer_id UUID;
    v_completed_count INTEGER;
    v_earned_commission NUMERIC;
    v_description TEXT;
    v_bonus NUMERIC := 100.00;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Admin role required';
    END IF;

    SELECT * INTO v_sub FROM public.task_submissions WHERE id = p_submission_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task submission not found';
    END IF;

    IF v_sub.status != 'refund_pending' THEN
        RAISE EXCEPTION 'Submission must be in refund_pending state';
    END IF;

    SELECT * INTO v_task FROM public.tasks WHERE id = v_sub.task_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Associated task not found';
    END IF;

    -- Create refund record
    INSERT INTO public.refunds (user_id, task_submission_id, amount, refund_number, status, admin_note, refunded_at)
    VALUES (v_sub.user_id, p_submission_id, v_sub.amount, p_refund_number, 'refunded', p_admin_note, NOW())
    RETURNING id INTO v_refund_id;

    -- Update submission status to 'refunded' (Completed)
    UPDATE public.task_submissions
    SET status = 'refunded',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_submission_id;

    -- Credit task bonus to user's wallet
    INSERT INTO public.wallet_transactions (user_id, type, amount, reference_type, reference_id, description)
    VALUES (
        v_sub.user_id,
        'bonus',
        v_task.bonus_amount,
        'refund',
        p_submission_id,
        'Cashback bonus for completed task: ' || v_task.title
    );

    -- ===== REFERRAL COMMISSION SYSTEM =====
    -- 1. Check if the user has a referrer
    SELECT referred_by INTO v_referrer_id FROM public.profiles WHERE id = v_sub.user_id;

    IF v_referrer_id IS NOT NULL THEN
        -- Count total completed tasks of User B (including this one)
        SELECT COUNT(*) INTO v_completed_count
        FROM public.task_submissions
        WHERE user_id = v_sub.user_id AND status = 'refunded';

        -- Check if it is a milestone of 10 tasks (10, 20, 30...)
        IF v_completed_count > 0 AND v_completed_count % 10 = 0 THEN
            -- Calculate current total referral commission earned by referrer to enforce 20,000 BDT limit
            SELECT COALESCE(SUM(amount), 0) INTO v_earned_commission
            FROM public.wallet_transactions
            WHERE user_id = v_referrer_id AND description LIKE 'Referral commission milestone%';

            IF v_earned_commission < 20000.00 THEN
                IF v_earned_commission + v_bonus > 20000.00 THEN
                    v_bonus := 20000.00 - v_earned_commission;
                END IF;

                IF v_bonus > 0 THEN
                    v_description := 'Referral commission milestone: ' || v_completed_count || ' tasks completed by User ID: ' || v_sub.user_id;

                    -- Check if already paid to prevent double payout
                    IF NOT EXISTS (
                        SELECT 1 FROM public.wallet_transactions 
                        WHERE user_id = v_referrer_id AND description = v_description
                    ) THEN
                        -- Credit referrer's wallet
                        INSERT INTO public.wallet_transactions (user_id, type, amount, reference_type, reference_id, description)
                        VALUES (
                            v_referrer_id,
                            'bonus',
                            v_bonus,
                            'refund',
                            p_submission_id,
                            v_description
                        );

                        -- Notify referrer
                        INSERT INTO public.notifications (user_id, title, message)
                        VALUES (
                            v_referrer_id,
                            'রেফারেল বোনাস অর্জিত! ৳' || v_bonus,
                            'আপনার আমন্ত্রিত ইউজার ' || v_completed_count || 'টি টাস্ক সম্পন্ন করায় আপনি ৳' || v_bonus || ' রেফারেল বোনাস পেয়েছেন।'
                        );
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Mark withdrawal paid
CREATE OR REPLACE FUNCTION public.admin_pay_withdrawal(
    p_withdrawal_id UUID,
    p_admin_note TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Admin role required';
    END IF;

    UPDATE public.withdrawals
    SET status = 'paid',
        admin_note = p_admin_note,
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_withdrawal_id AND (status = 'pending' OR status = 'processing');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Reject withdrawal request and return reserved balance
CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(
    p_withdrawal_id UUID,
    p_admin_note TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_wdr RECORD;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Admin role required';
    END IF;

    SELECT * INTO v_wdr FROM public.withdrawals WHERE id = p_withdrawal_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Withdrawal request not found';
    END IF;

    IF v_wdr.status = 'paid' OR v_wdr.status = 'rejected' OR v_wdr.status = 'cancelled' THEN
        RAISE EXCEPTION 'Withdrawal is already completed';
    END IF;

    UPDATE public.withdrawals
    SET status = 'rejected',
        admin_note = p_admin_note,
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_withdrawal_id;

    -- Refund balance back to user's wallet
    INSERT INTO public.wallet_transactions (user_id, type, amount, reference_type, reference_id, description)
    VALUES (
        v_wdr.user_id,
        'reversal',
        v_wdr.amount,
        'withdrawal',
        p_withdrawal_id,
        'Reversal of rejected withdrawal request'
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 1. PROFILES POLICIES
CREATE POLICY "Allow profiles select own or referred" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR auth.uid() = referred_by);
CREATE POLICY "Allow profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Allow profiles admin all" ON public.profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 2. ADMIN USERS POLICIES
CREATE POLICY "Allow admin_users select own" ON public.admin_users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Allow admin_users admin all" ON public.admin_users FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 3. TASKS POLICIES
CREATE POLICY "Allow tasks select active" ON public.tasks FOR SELECT TO authenticated USING (is_active = TRUE OR public.is_admin(auth.uid()));
CREATE POLICY "Allow tasks admin all" ON public.tasks FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 4. TASK SUBMISSIONS POLICIES
CREATE POLICY "Allow submissions select own or referred" ON public.task_submissions FOR SELECT TO authenticated USING (
    auth.uid() = user_id 
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = task_submissions.user_id AND referred_by = auth.uid()
    )
);
CREATE POLICY "Allow submissions insert own" ON public.task_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow submissions admin all" ON public.task_submissions FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 5. PAYMENTS POLICIES
CREATE POLICY "Allow payments select own" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Allow payments insert own" ON public.payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow payments admin all" ON public.payments FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 6. REFUNDS POLICIES
CREATE POLICY "Allow refunds select own" ON public.refunds FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Allow refunds admin all" ON public.refunds FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 7. WALLET TRANSACTIONS POLICIES
CREATE POLICY "Allow wallet_transactions select own" ON public.wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Allow wallet_transactions admin all" ON public.wallet_transactions FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 8. WITHDRAWALS POLICIES
CREATE POLICY "Allow withdrawals select own" ON public.withdrawals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Allow withdrawals admin all" ON public.withdrawals FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 9. NOTIFICATIONS POLICIES
CREATE POLICY "Allow notifications select own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Allow notifications update own" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Allow notifications admin all" ON public.notifications FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 10. APP SETTINGS POLICIES
CREATE POLICY "Allow app_settings select all" ON public.app_settings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Allow app_settings admin all" ON public.app_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid()));


-- ====================================================
-- AUTOMATED NOTIFICATION TRIGGERS FOR USER EXPERIENCE
-- ====================================================

-- Task submission notify trigger
CREATE OR REPLACE FUNCTION public.on_task_submission_status_changed()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (
      NEW.user_id,
      'Task Status: ' || INITCAP(NEW.status),
      'Your task submission for Transaction ID: ' || NEW.transaction_id || ' is now ' || NEW.status || '.'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER tr_task_submission_status_notify
  AFTER UPDATE OF status ON public.task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.on_task_submission_status_changed();

-- Withdrawal notify trigger
CREATE OR REPLACE FUNCTION public.on_withdrawal_status_changed()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (
      NEW.user_id,
      'Withdrawal Status: ' || INITCAP(NEW.status),
      'Your withdrawal request of ৳' || NEW.amount || ' via ' || NEW.method || ' has been marked ' || NEW.status || '.'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER tr_withdrawal_status_notify
  AFTER UPDATE OF status ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.on_withdrawal_status_changed();
