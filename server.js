const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

const DB_FILE = './database.json';

// Structure de base de données initiale et sécurisée
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ salons: {} }, null, 2));
}

function lireDonnees() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
        return { salons: {} };
    }
}

function sauvegarderDonnees(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const listeDefis = [
    { id: 1, categorie: "💪 Sport", titre: "Fais 30 pompes", desc: "À faire en une seule fois.", xp: 150 },
    { id: 2, categorie: "🎨 Créativité", titre: "Coucher de soleil", desc: "Prends une belle photo ce soir.", xp: 300 },
    { id: 3, categorie: "📚 Études", titre: "Lecture du jour", desc: "Lis 15 pages d'un livre.", xp: 200 }
];

// 1. PAGE D'ACCUEIL : Choix entre Créer ou Rejoindre
app.get('/', (req, res) => {
    res.render('accueil', { erreur: req.query.error || null });
});

// 2. ACTION : Créer un salon avec un code personnalisé
app.post('/creer-salon', (req, res) => {
    const code = req.body.code ? req.body.code.trim().toUpperCase() : null;
    const pseudo = req.body.pseudo ? req.body.pseudo.trim() : null;

    if (!code || !pseudo) return res.redirect('/?error=Tous les champs sont requis');

    let db = lireDonnees();

    if (db.salons && db.salons[code]) {
        return res.redirect('/?error=Ce code de session existe déjà');
    }

    db.salons[code] = {
        codeSession: code,
        createur: pseudo,
        joueurs: {}
    };

    db.salons[code].joueurs[pseudo] = {
        pseudo: pseudo,
        xp: 0,
        niveau: 1,
        rang: "Débutant",
        defisFaits: [],
        dernierePhoto: null
    };

    sauvegarderDonnees(db);
    res.redirect(`/salon?code=${code}&u=${encodeURIComponent(pseudo)}`);
});

// 3. ACTION : Rejoindre un salon existant via son code
app.post('/rejoindre-salon', (req, res) => {
    const code = req.body.code ? req.body.code.trim().toUpperCase() : null;
    const pseudo = req.body.pseudo ? req.body.pseudo.trim() : null;

    if (!code || !pseudo) return res.redirect('/?error=Tous les champs sont requis');

    let db = lireDonnees();

    if (!db.salons || !db.salons[code]) {
        return res.redirect(`/?error=Le code de session "${code}" est introuvable`);
    }

    if (!db.salons[code].joueurs[pseudo]) {
        db.salons[code].joueurs[pseudo] = {
            pseudo: pseudo,
            xp: 0,
            niveau: 1,
            rang: "Débutant",
            defisFaits: [],
            dernierePhoto: null
        };
        sauvegarderDonnees(db);
    }

    res.redirect(`/salon?code=${code}&u=${encodeURIComponent(pseudo)}`);
});

// 4. PAGE : Le Dashboard du salon de jeu
app.get('/salon', (req, res) => {
    const code = req.query.code;
    const pseudo = req.query.u;

    if (!code || !pseudo) return res.redirect('/');

    let db = lireDonnees();
    
    if (!db.salons || !db.salons[code]) {
        return res.redirect('/?error=Cette session a été fermée ou n\'existe plus');
    }
    
    let salon = db.salons[code];
    let joueurActuel = salon.joueurs ? salon.joueurs[pseudo] : null;
    
    if (!joueurActuel) {
        return res.redirect('/?error=Accès refusé ou joueur introuvable dans ce salon');
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

// 5. ACTION : Fermer définitivement le salon (Réservé au créateur)
app.post('/fermer-salon', (req, res) => {
    const code = req.body.code;
    const pseudo = req.body.pseudo;

    let db = lireDonnees();
    if (db.salons && db.salons[code] && db.salons[code].createur === pseudo) {
        delete db.salons[code]; 
        sauvegarderDonnees(db);
        
        io.to(code).emit('salon_ferme_par_hote');
    }
    res.redirect('/');
});


// 🌐 SYNCHRONISATION MULTIJOUEUR VIA SOCKET.IO (Gestion de la photo incluse)
io.on('connection', (socket) => {

    socket.on('rejoindre_salon', (data) => {
        if (!data || !data.codeSession || !data.pseudo) return;
        
        socket.pseudo = data.pseudo;
        socket.codeSession = data.codeSession;
        
        socket.join(data.codeSession);
        console.log(`🟢 [Salon ${data.codeSession}] ${data.pseudo} s'est connecté.`);
    });

    socket.on('action_valider', (data) => {
        if (!socket.codeSession || !socket.pseudo || !data.image) return; // REQUIS : Photo obligatoire

        let db = lireDonnees();
        let salon = db.salons ? db.salons[socket.codeSession] : null;
        if (!salon || !salon.joueurs) return;

        let joueur = salon.joueurs[socket.pseudo];
        let defiId = parseInt(data.id);
        let defi = listeDefis.find(d => d.id === defiId);

        if (joueur && defi && !joueur.defisFaits.includes(defiId)) {
            joueur.defisFaits.push(defiId);
            joueur.xp += defi.xp;
            joueur.niveau = Math.floor(joueur.xp / 500) + 1;
            
            // Stockage de la preuve photo en base 64
            joueur.dernierePhoto = data.image;

            if (joueur.niveau >= 50) joueur.rang = "GOAT 🐐";
            else if (joueur.niveau >= 25) joueur.rang = "Maître";
            else if (joueur.niveau >= 10) joueur.rang = "Légende";
            else if (joueur.niveau >= 5) joueur.rang = "Aventurier";

            sauvegarderDonnees(db);

            socket.emit('validation_reussie', { joueur, defiId });

            let classementAjour = Object.values(salon.joueurs)
                .sort((a, b) => b.xp - a.xp)
                .map((player, index) => ({ ...player, position: index + 1 }));

            io.to(socket.codeSession).emit('maj_classement_global', classementAjour);
            io.to(socket.codeSession).emit('alerte_pote_reussite', { pseudo: socket.pseudo, titreDefi: defi.titre, image: data.image });
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 ChallengeHub sécurisé tourne sur http://localhost:${PORT}`);
});
