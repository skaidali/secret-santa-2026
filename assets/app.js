const REPO_CONFIG = (() => {
    const host = window.location.hostname;
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    // Détection automatique sur GitHub Pages (user.github.io/repo)
    if (host.endsWith('github.io')) {
        return {
            owner: host.split('.')[0],
            repo: pathParts[0] || 'secret-santa'
        };
    }
    // Fallback pour les tests en local
    return { owner: 'TON-PSEUDO-GITHUB', repo: 'secret-santa' };
})();

const API_BASE = `https://api.github.com/repos/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}`;
const REPO_URL = `https://github.com/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}`;

let drawData = null;

// Utilitaires Base64
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function init() {
    document.getElementById('repo-link').href = REPO_URL;

    try {
        const res = await fetch(`tirage.json?v=${Date.now()}`);
        if (!res.ok) throw new Error('Draw not published yet');
        
        drawData = await res.json();
        showLoginView(Object.keys(drawData));
    } catch {
        showRegisterView();
        loadCurrentRoster();
    }
}

function showRegisterView() {
    document.getElementById('view-register').hidden = false;
    document.getElementById('form-register').addEventListener('submit', handleRegister);
}

function showLoginView(participants) {
    document.getElementById('view-login').hidden = false;
    const select = document.getElementById('login-name');
    
    select.innerHTML = '<option value="" disabled selected>Sélectionnez votre nom</option>';
    participants.sort((a, b) => a.localeCompare(b)).forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });

    document.getElementById('form-login').addEventListener('submit', handleLogin);
}

async function loadCurrentRoster() {
    const listEl = document.getElementById('roster-list');
    const countEl = document.getElementById('roster-count');

    try {
        const res = await fetch(`${API_BASE}/issues?state=open&per_page=100`);
        if (!res.ok) throw new Error();
        const issues = await res.json();

        const names = issues
            .filter((issue) => issue.title.startsWith('[INSCRIPTION]'))
            .map((issue) => issue.title.replace('[INSCRIPTION]', '').trim());

        countEl.textContent = names.length;

        if (names.length === 0) {
            listEl.innerHTML = '<li class="muted">Aucun participant inscrit pour le moment.</li>';
            return;
        }

        listEl.innerHTML = '';
        names.forEach((name) => {
            const li = document.createElement('li');
            li.textContent = name;
            listEl.appendChild(li);
        });
    } catch {
        listEl.innerHTML = '<li class="muted">Liste indisponible hors ligne.</li>';
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const password = document.getElementById('reg-pass').value;
    if (!name || !password) return;

    // 1. Génération de la paire de clés asymétriques ECDH P-256
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey']
    );
    const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    // 2. Chiffrement symétrique de la clé privée avec le mot de passe (PBKDF2 + AES-GCM)
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );

    const encryptedPriv = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        enc.encode(JSON.stringify(privJwk))
    );

    // 3. Encodage du jeton public
    const payload = JSON.stringify({
        nom: name,
        pub: toB64(pubRaw),
        s: toB64(salt),
        iv: toB64(iv),
        priv: toB64(encryptedPriv)
    });

    const token = btoa(unescape(encodeURIComponent(payload)));
    const issueTitle = encodeURIComponent(`[INSCRIPTION] ${name}`);
    const issueBody = encodeURIComponent(
        `Cliquez sur **Create** ci-dessous pour valider votre inscription au Secret Santa.\n\n\`\`\`json\n${token}\n\`\`\``
    );

    const issueUrl = `${REPO_URL}/issues/new?title=${issueTitle}&body=${issueBody}`;
    const actionBox = document.getElementById('register-action');
    actionBox.hidden = false;
    actionBox.innerHTML = `
        <p>Votre clé cryptographique est prête. Cliquez sur le bouton ci-dessous puis validez l'ouverture du ticket sur GitHub :</p>
        <a href="${issueUrl}" target="_blank" rel="noopener" class="btn btn-github">Finaliser l'inscription sur GitHub</a>
    `;
}

async function handleLogin(event) {
    event.preventDefault();
    const name = document.getElementById('login-name').value;
    const password = document.getElementById('login-pass').value;
    const errorBox = document.getElementById('login-error');
    const revealBox = document.getElementById('reveal-box');

    errorBox.hidden = true;
    revealBox.hidden = true;

    if (!name || !password || !drawData?.[name]) return;

    try {
        const entry = drawData[name];
        const enc = new TextEncoder();

        // 1. Déchiffrement de la clé privée personnelle
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
        const aesKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: fromB64(entry.s), iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        const privJwkBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: fromB64(entry.iv) },
            aesKey,
            fromB64(entry.priv)
        );
        const privJwk = JSON.parse(new TextDecoder().decode(privJwkBuffer));
        const privateKey = await crypto.subtle.importKey(
            'jwk',
            privJwk,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveKey']
        );

        // 2. Dérivation du secret partagé ECDH et déchiffrement de la cible
        const ephemPub = await crypto.subtle.importKey(
            'raw',
            fromB64(entry.ephemPub),
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );

        const sharedKey = await crypto.subtle.deriveKey(
            { name: 'ECDH', public: ephemPub },
            privateKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        const targetBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: fromB64(entry.cibleIv) },
            sharedKey,
            fromB64(entry.cibleChiffree)
        );

        document.getElementById('reveal-target').textContent = new TextDecoder().decode(targetBuffer);
        revealBox.hidden = false;
    } catch {
        errorBox.textContent = 'Mot de passe incorrect. Vérifiez votre saisie.';
        errorBox.hidden = false;
    }
}

init();