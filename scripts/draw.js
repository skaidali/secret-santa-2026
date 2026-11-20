const fs = require('fs');
const crypto = require('crypto');

async function run() {
    if (fs.existsSync('tirage.json')) {
        console.log('tirage.json existe déjà. Aucune action requise.');
        return;
    }

    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    const eventName = process.env.GITHUB_EVENT_NAME;
    const expectedCount = parseInt(process.env.NB_PARTICIPANTS || '0', 10);

    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Secret-Santa-Bot'
    };

    const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, { headers });
    if (!res.ok) throw new Error(`Erreur API GitHub: ${res.status}`);
    const issues = await res.json();

    const participants = [];
    const seenNames = new Set();

    for (const issue of issues) {
        if (!issue.title.startsWith('[INSCRIPTION]')) continue;
        const match = issue.body?.match(/```json\s*([\s\S]*?)\s*```/);
        if (!match) continue;

        try {
            const parsed = JSON.parse(Buffer.from(match[1].trim(), 'base64').toString('utf8'));
            const key = parsed.nom.toLowerCase();
            if (!seenNames.has(key)) {
                seenNames.add(key);
                participants.push({ ...parsed, issueNumber: issue.number });
            }
        } catch {
            console.warn(`Issue #${issue.number} ignorée : jeton invalide.`);
        }
    }

    console.log(`Inscriptions valides : ${participants.length} / ${expectedCount}`);

    const quotaReached = expectedCount > 0 && participants.length >= expectedCount;
    const forcedRun = eventName === 'schedule' || eventName === 'workflow_dispatch';

    if (!quotaReached && !forcedRun) {
        console.log('En attente des participants restants.');
        return;
    }

    if (participants.length < 3) {
        console.log('Minimum de 3 participants requis pour effectuer un tirage.');
        return;
    }

    // Dérangement aléatoire cryptographique (Fisher-Yates + vérification sans point fixe)
    let targets = [...participants];
    let valid = false;
    while (!valid) {
        for (let i = targets.length - 1; i > 0; i--) {
            const j = crypto.randomInt(0, i + 1);
            [targets[i], targets[j]] = [targets[j], targets[i]];
        }
        valid = participants.every((p, idx) => p.nom !== targets[idx].nom);
    }

    // Chiffrement asymétrique individuel
    const { subtle } = crypto.webcrypto;
    const output = {};

    for (let i = 0; i < participants.length; i++) {
        const giver = participants[i];
        const receiver = targets[i];

        const ephemKeyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
        const ephemPubRaw = await subtle.exportKey('raw', ephemKeyPair.publicKey);
        const userPubKey = await subtle.importKey(
            'raw',
            Buffer.from(giver.pub, 'base64'),
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );

        const sharedKey = await subtle.deriveKey(
            { name: 'ECDH', public: userPubKey },
            ephemKeyPair.privateKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );

        const iv = crypto.randomBytes(12);
        const encryptedTarget = await subtle.encrypt(
            { name: 'AES-GCM', iv },
            sharedKey,
            new TextEncoder().encode(receiver.nom)
        );

        output[giver.nom] = {
            s: giver.s,
            iv: giver.iv,
            priv: giver.priv,
            ephemPub: Buffer.from(ephemPubRaw).toString('base64'),
            cibleIv: iv.toString('base64'),
            cibleChiffree: Buffer.from(encryptedTarget).toString('base64')
        };
    }

    fs.writeFileSync('tirage.json', JSON.stringify(output, null, 2));

    // Fermeture des tickets d'inscription
    for (const p of participants) {
        await fetch(`https://api.github.com/repos/${repo}/issues/${p.issueNumber}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ state: 'closed' })
        });
    }

    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, 'ready=true\n');
    }
    console.log('Tirage généré et tickets fermés.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
}); 