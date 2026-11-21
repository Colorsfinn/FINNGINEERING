import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
    'https://lyavctuwlyegrnfwqgez.supabase.co',
    'sb_publishable_-z5-3a45iAHLC6-cY2UR_w_nz-RB095'
);

export async function requireAdmin(onChange) {
    const form = document.querySelector('#sign-in');
    const status = document.querySelector('#auth-status');
    const signOut = document.querySelector('#sign-out');

    const emailLink = document.querySelector('#email-sign-in');
    const passwordSettings = document.querySelector('#password-settings');
    const passwordForm = document.querySelector('#set-password');
    const passwordStatus = document.querySelector('#password-status');

    async function signIn(event, withPassword) {
        event.preventDefault();
        const emailField = form.elements.email;
        const passwordField = form.elements.password;
        if (!emailField.reportValidity()) return;
        if (withPassword && !passwordField.value) {
            status.textContent = 'Enter your password or request an email sign-in link.';
            passwordField.focus();
            return;
        }
        const button = form.querySelector('button');
        const email = emailField.value.trim().toLowerCase();
        button.disabled = true;
        emailLink.disabled = true;
        try {
            const { error } = withPassword
                ? await supabase.auth.signInWithPassword({ email, password: passwordField.value })
                : await supabase.auth.signInWithOtp({
                    email,
                    options: { emailRedirectTo: location.href.split('#')[0] }
                });
            status.textContent = error?.message ?? (withPassword ? 'Checking admin access…' : 'Check your email for a sign-in link.');
            if (withPassword && !error) passwordField.value = '';
        } catch {
            status.textContent = 'Sign-in could not be completed. Try again.';
        } finally {
            button.disabled = false;
            emailLink.disabled = false;
        }
    }

    form.addEventListener('submit', (event) => signIn(event, true));
    emailLink.addEventListener('click', (event) => signIn(event, false));

    passwordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (passwordSettings.hidden) return;
        const button = passwordForm.querySelector('button');
        button.disabled = true;
        try {
            const { error } = await supabase.auth.updateUser({
                password: passwordForm.elements.newPassword.value
            });
            passwordStatus.textContent = error?.message ?? 'Password saved. You can now sign in with email and password.';
            if (!error) passwordForm.reset();
        } catch {
            passwordStatus.textContent = 'Password could not be saved. Try again.';
        } finally {
            button.disabled = false;
        }
    });

    signOut.addEventListener('click', async () => {
        const { error } = await supabase.auth.signOut();
        if (error) status.textContent = error.message;
    });

    let revision = 0;
    supabase.auth.onAuthStateChange((_event, session) => {
        const current = ++revision;
        setTimeout(async () => {
            const result = session ? await supabase.rpc('fin_is_admin') : {};
            if (current !== revision) return;
            const allowed = result.data === true;
            form.hidden = Boolean(session);
            signOut.hidden = !session;
            passwordSettings.hidden = !allowed;
            if (!allowed) {
                passwordSettings.open = false;
                passwordForm.reset();
                passwordStatus.textContent = '';
            }
            status.textContent = allowed ? '' : result.error
                ? 'Admin access could not be checked.'
                : session ? 'This email does not have admin access.' : 'Sign in with your admin email.';
            onChange(allowed);
        }, 0);
    });
}
