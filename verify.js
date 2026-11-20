import { requireAdmin, supabase } from './auth.js';

const element = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const code = params.get('id');

if (params.get('admin') === '1') {
    element('admin-login').hidden = false;
    setupAdmin();
} else {
    setupPublicCheck();
}

async function sha256(file) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function setupPublicCheck() {
    const status = element('verify_result');
    if (!code) {
        status.textContent = 'Open the verification link from the PDF’s QR code.';
        return;
    }

    const form = element('check-public-pdf');
    const input = element('public-pdf');
    const button = form.querySelector('button');
    element('public-check').hidden = false;

    input.addEventListener('change', () => {
        delete status.dataset.state;
        status.textContent = input.files[0] ? 'Selected: ' + input.files[0].name : '';
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const file = input.files[0];
        if (button.disabled) return;
        if (!file) {
            status.textContent = 'Choose the PDF from Files or Downloads first. If the file picker does not open, open this full QR link in Safari or Chrome.';
            input.focus();
            return;
        }

        delete status.dataset.state;
        status.textContent = 'Checking PDF…';
        input.disabled = true;
        button.disabled = true;
        try {
            const pdfHash = await sha256(file);
            const { data, error } = await supabase.rpc('fin_verify_pdf', {
                project_code: code,
                pdf_hash: pdfHash
            }).abortSignal(AbortSignal.timeout(15000));
            if (error || typeof data !== 'boolean') throw new Error('Verification failed');
            status.dataset.state = data ? 'verified' : 'mismatch';
            status.textContent = data ? '✓ Verified' : 'Not verified';
        } catch {
            status.textContent = 'Could not check the PDF. Try again.';
        } finally {
            input.disabled = false;
            button.disabled = false;
        }
    });
}

function setupAdmin() {
    const details = element('details');
    const pdfLink = element('pdf-link');
    const lookupStatus = element('lookup-status');
    const savedList = element('saved-views');
    const savedStatus = element('saved-status');
    const detailStatus = element('detail-status');
    const fields = ['project_name', 'license_number', 'date_issued'];
    let activeProject;
    let allowed = false;
    let lookupRevision = 0;
    let savedRevision = 0;

    function clearProject() {
        activeProject = undefined;
        details.hidden = true;
        pdfLink.hidden = true;
        pdfLink.removeAttribute('href');
        fields.forEach((field) => { element(field).textContent = ''; });
        detailStatus.textContent = '';
    }

    async function openProject(column, value) {
        if (!allowed) return;
        const revision = ++lookupRevision;
        clearProject();
        lookupStatus.textContent = 'Checking…';
        const { data, error } = await supabase.from('projects')
            .select('id, project_name, license_number, date_issued, pdf_url')
            .eq(column, value).limit(1).maybeSingle();
        if (revision !== lookupRevision) return;
        lookupStatus.textContent = error ? 'Project lookup failed.' : data ? '' : 'Project not found.';
        if (!data) return;
        activeProject = data;
        fields.forEach((field) => { element(field).textContent = data[field] ?? ''; });
        details.hidden = false;
    }

    async function refreshSavedViews() {
        const revision = ++savedRevision;
        const { data, error } = await supabase.from('fin_saved_views')
            .select('project_code').order('project_code');
        if (!allowed || revision !== savedRevision) return;
        savedList.replaceChildren();
        savedStatus.textContent = error ? 'Saved views could not be loaded.' : '';
        if (!data) return;
        if (!data.length) savedStatus.textContent = 'No saved views yet.';
        for (const { project_code } of data) {
            const item = document.createElement('li');
            const open = document.createElement('button');
            open.textContent = 'Open project ' + project_code;
            open.addEventListener('click', () => openProject('id', project_code));
            const remove = document.createElement('button');
            remove.textContent = 'Remove saved view';
            remove.addEventListener('click', async () => {
                const { error } = await supabase.from('fin_saved_views')
                    .delete().eq('project_code', project_code);
                if (error) savedStatus.textContent = 'Saved view could not be removed.';
                else await refreshSavedViews();
            });
            item.append(open, ' ', remove);
            savedList.append(item);
        }
    }

    element('lookup').addEventListener('submit', (event) => {
        event.preventDefault();
        const value = event.currentTarget.elements.projectCode.value.trim();
        const projectCode = URL.canParse(value) ? new URL(value).searchParams.get('id') : value;
        if (projectCode) openProject('id', projectCode);
        else lookupStatus.textContent = 'Enter a project ID or a verification link with an ID.';
    });

    element('verify-file').addEventListener('submit', async (event) => {
        event.preventDefault();
        const file = event.currentTarget.elements.pdf.files[0];
        if (!file || !allowed) return;
        const revision = ++lookupRevision;
        clearProject();
        lookupStatus.textContent = 'Checking…';
        try {
            const hash = await sha256(file);
            if (revision === lookupRevision) await openProject('hash', hash);
        } catch {
            if (revision === lookupRevision) lookupStatus.textContent = 'The PDF could not be checked.';
        }
    });

    element('open-pdf').addEventListener('click', async () => {
        const project = activeProject;
        if (!project?.pdf_url) {
            detailStatus.textContent = 'No PDF is on file.';
            return;
        }
        // Previous records store a public URL. Use its object path with the now-private bucket.
        const marker = '/object/public/project-pdfs/';
        const path = project.pdf_url.includes(marker)
            ? decodeURIComponent(project.pdf_url.split(marker)[1])
            : project.pdf_url;
        const { data, error } = await supabase.storage.from('project-pdfs').createSignedUrl(path, 60);
        if (activeProject !== project) return;
        detailStatus.textContent = error ? 'PDF link could not be created.' : 'PDF link expires in 60 seconds.';
        if (data) {
            pdfLink.href = data.signedUrl;
            pdfLink.hidden = false;
        }
    });

    element('save-view').addEventListener('click', async () => {
        const project = activeProject;
        if (!project) return;
        const { error } = await supabase.from('fin_saved_views').insert({ project_code: String(project.id) });
        const saved = !error || error.code === '23505';
        if (activeProject === project) detailStatus.textContent = saved ? 'View saved.' : 'View could not be saved.';
        if (saved && allowed) await refreshSavedViews();
    });

    element('grant-admin').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const { error } = await supabase.rpc('fin_grant_admin', { admin_email: form.elements.email.value });
        element('grant-status').textContent = error ? 'Access could not be granted.' :
            'Access granted. The new admin can request a sign-in link.';
        if (!error) form.reset();
    });

    requireAdmin((isAdmin) => {
        if (isAdmin === allowed) return;
        allowed = isAdmin;
        element('admin-tools').hidden = !allowed;
        if (allowed) {
            refreshSavedViews();
            if (code) openProject('id', code);
        } else {
            lookupRevision++;
            savedRevision++;
            clearProject();
            savedList.replaceChildren();
            lookupStatus.textContent = '';
            savedStatus.textContent = '';
            element('grant-status').textContent = '';
        }
    });
}
