const express = require('express');
const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

// Stockage temporaire en RAM (Valable uniquement le temps que la fonction est éveillée)
let salonsDonnees = {};

const listeDefis = [
    { id: 1, categorie: "💪 Sport", titre: "Fais 30 pompes", desc: "À faire en une seule fois.", xp: 150 },
    { id: 2, categorie: "🎨 Créativité", titre: "Coucher de soleil", desc: "Prends une belle photo ce soir.", xp: 300 },
    { id: 3, categorie: "📚 Études", titre: "Lecture du jour", desc: "Lis 15 pages d'un livre.", xp: 200 }
];

// 1. PAGE D'ACCUEIL
app.get('/', (req, res) => {
    res.render('accueil', { erreur: req.query.error || null });
});

// 2. ACTION : Créer un salon
app.post('/creer-salon', (req, res) => {
    const code = req.body.code ? req.body.code.trim().toUpperCase() : null;
    const pseudo = req.body.pseudo ? req.body.pseudo.trim() : null;

    if (!code || !pseudo) return res.redirect('/?error=Tous les champs sont requis');

    if (salonsDonnees[code]) {
        return res.redirect('/?error=Ce code de session existe déjà');
    }

    salonsDonnees[code] = {
        codeSession: code,
        createur: pseudo,
        joueurs: {}
    };

    salonsDonnees[code].joueurs[pseudo] = {
        pseudo: pseudo,
        xp: 0,
        niveau: 1,
        rang: "Débutant",
        defisFaits: [],
        dernierePhoto: null
    };

    res.redirect(`/salon?code=${code}&u=${encodeURIComponent(pseudo)}`);
});

// 3. ACTION : Rejoindre un salon
app.post('/rejoindre-salon', (req, res) => {
    const code = req.body.code ? req.body.code.trim().toUpperCase() : null;
    const pseudo = req.body.pseudo ? req.body.pseudo.trim() : null;

    if (!code || !pseudo) return res.redirect('/?error=Tous les champs sont requis');

    if (!salonsDonnees[code]) {
        return res.redirect(`/?error=Le code de session "${code}" est introuvable`);
    }

    if (!salonsDonnees[code].joueurs[pseudo]) {
        salonsDonnees[code].joueurs[pseudo] = {
            pseudo: pseudo,
            xp: 0,
            niveau: 1,
            rang: "Débutant",
            defisFaits: [],
            dernierePhoto: null
        };
    }

    res.redirect(`/salon?code=${code}&u=${encodeURIComponent(pseudo)}`);
});

// 4. PAGE : Dashboard du salon
app.get('/salon', (req, res) => {
    const code = req.query.code;
    const pseudo = req.query.u;

    if (!code || !pseudo) return res.redirect('/');
    
    if (!salonsDonnees[code]) {
        return res.redirect('/?error=Cette session a été fermée ou n\'existe plus');
    }
    
    let salon = salonsDonnees[code];
    let joueurActuel = salon.joueurs ? salon.joueurs[pseudo] : null;
    
    if (!joueurActuel) {
        return res.redirect('/?error=Joueur introuvable dans ce salon');
    }

    let classement = Object.values(salon.joueurs)
        .sort((a, b) => b.xp - a.xp)
        .map((player, index) => ({ ...player, position: index + 1 }));

    res.render('index', {
        codeSession: code,
        isCreateur: salon.createur === pseudo,
        user: joueurActuel,
        challenges: listeDefis,
        leaderboard: classement
    });
});

// 5. ACTION : Fermer le salon
app.post('/fermer-salon', (req, res) => {
    const code = req.body.code;
    const pseudo = req.body.pseudo;

    if (salonsDonnees[code] && salonsDonnees[code].createur === pseudo) {
        delete salonsDonnees[code]; 
    }
    res.redirect('/');
});

// ⚠️ IMPORTANT : On exporte l'application Express elle-même pour Vercel. 
// Pas de server.listen(), pas de configuration Socket.io complexe ici sous peine de crash Serverless.
module.exports = app;
