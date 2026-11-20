import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
    'https://lyavctuwlyegrnfwqgez.supabase.co',
    'sb_publishable_-z5-3a45iAHLC6-cY2UR_w_nz-RB095'
);

export async function requireAdmin(onChange) {
    const form = document.querySelector('#sign-in');
    const status = document.querySelector('#auth-status');
    const signOut = document.querySelector('#sign-out');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button');
        button.disabled = true;
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: form.elements.email.value.trim().toLowerCase(),
                options: { emailRedirectTo: location.href.split('#')[0] }
            });
            status.textContent = error?.message ?? 'Check your email for a sign-in link.';
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
            status.textContent = allowed ? '' : result.error
                ? 'Admin access could not be checked.'
                : session ? 'This email does not have admin access.' : 'Sign in with your admin email.';
            onChange(allowed);
        }, 0);
    });
}
