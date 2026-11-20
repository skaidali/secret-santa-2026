const fs = require('fs');
const crypto = require('crypto');

async function run() {
    if (fs.existsSync('tirage.json')) {
        console.log('tirage.json existe déjà. Aucune action requise.');
        return;
    }

    const repo = process.env.GITHUB_REPOSITORY; // format "owner/repo"
    const eventName = process.env.GITHUB_EVENT_NAME;
    const expectedCount = parseInt(process.env.NB_PARTICIPANTS || '0', 10);

    // Génère exactement le même nom de canal ntfy.sh que assets/app.js
    const [owner, repoName] = repo.split('/');
    const topic = `ss-zk-${owner}-${repoName}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const ntfyUrl = `https://ntfy.sh/${topic}/json?poll=1&since=all`;

    console.log(`Lecture des inscriptions sur le canal : ${topic}`);

    const res = await fetch(ntfyUrl);
    if (!res.ok) throw new Error(`Erreur lors de la lecture sur ntfy.sh : ${res.status}`);
    const text = await res.text();

    const lines = text.trim().split('\n').filter(Boolean);
    const participants = [];
    const seenNames = new Set();

    for (const line of lines) {
        try {
            const msg = JSON.parse(line);
            if (msg.event !== 'message' || !msg.message) continue;

            const parsed = JSON.parse(Buffer.from(msg.message, 'base64').toString('utf8'));
            if (!parsed.nom || !parsed.pub || !parsed.priv) continue;

            const key = parsed.nom.trim().toLowerCase();
            if (!seenNames.has(key)) {
                seenNames.add(key);
                participants.push(parsed);
            }
        } catch {
            // Ignore les messages invalides
        }
    }

    console.log(`Inscriptions valides trouvées : ${participants.length} / ${expectedCount}`);

    const quotaReached = expectedCount > 0 && participants.length >= expectedCount;
    const forcedRun = eventName === 'workflow_dispatch';

    if (!quotaReached && !forcedRun) {
        console.log('Quota non atteint. En attente des participants restants.');
        return;
    }

    if (participants.length < 3) {
        console.log('Minimum de 3 participants requis pour effectuer un tirage.');
        return;
    }

    // Dérangement aléatoire cryptographique (personne ne se tire soi-même)
    let targets = [...participants];
    let valid = false;
    while (!valid) {
        for (let i = targets.length - 1; i > 0; i--) {
            const j = crypto.randomInt(0, i + 1);
            [targets[i], targets[j]] = [targets[j], targets[i]];
        }
        valid = participants.every((p, idx) => p.nom !== targets[idx].nom);
    }

    // Chiffrement asymétrique ECDH P-256 + AES-GCM pour chaque participant
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

    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, 'ready=true\n');
    }
    console.log('Tirage généré avec succès.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});