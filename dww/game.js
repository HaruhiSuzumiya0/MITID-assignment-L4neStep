// game.js = le coeur du jeu : les notes qui tombent, les touches, le jugement
// (Perfect / Okay / Miss), le score, et tout ce qui est dessiné dans le canvas.

// Configuration
// Tous les réglages du jeu sont là. Si je veux changer un truc (vitesse des notes,
// taille des lanes, les touches...) c'est ici.
let config = {
    // Touches par caractère et non par position :
    // « z » reste la touche marquée Z, en AZERTY comme en QWERTY
    keys: ["z", "e", "o", "p"], // lane 0, 1, 2, 3 (de gauche à droite)
    laneWidth: 92,  // largeur d'une lane en pixels
    separator: 6,   // largeur des barres argentées entre les lanes
    height: 720,  // même hauteur que la scène
    hitLineY: 630,  // hauteur de la ligne où il faut taper les notes
    noteHeight: 26, // épaisseur d'une note
    scrollSpeed: 800, // pixels par seconde
    leadIn: 2,        // secondes avant le début de la musique
    // Fenêtres de jugement : écart max (en secondes ±) avec le temps de la note
    // Ex. : si on tape à plus ou moins de 40 ms de la note c'est Perfect
    // weight = combien ça rapporte de points (Perfect = tout, Okay = la moitié)
    judgements: [
        { name: "Perfect", window: 0.040, weight: 1,   color: "#ffe14d" },
        { name: "Okay",    window: 0.090, weight: 0.5, color: "#5fd0ff" },
    ],
    missWindow: 0.135, // au-delà : la note est ratée
    maxScore: 100000,  // le score si on fait que des Perfect
};
// Largeur totale du terrain : 4 lanes + 5 séparateurs 
config.width = config.laneWidth * 4 + config.separator * 5;
// Le Miss est à part parce que c'est pas une "fenêtre", c'est juste quand on a raté
let miss = { name: "Miss", weight: 0, color: "#ff5577" };

// Lanes extérieures blanches, intérieures roses
let whiteNote = { top: "#ffffff", mid: "#e3e5eb", bottom: "#aeb2bc", edge: "#80848e" };
let pinkNote  = { top: "#ff9cc8", mid: "#f0428f", bottom: "#c21a66", edge: "#8a0f47" };
let noteStyles = [whiteNote, pinkNote, pinkNote, whiteNote]; 

// État
// audioCtx c'est le "moteur audio" du navigateur (Web Audio API).
// On s'en sert pour jouer la musique ET comme horloge (voir plus bas)
let audioCtx = new AudioContext();

// Tout ce qui change pendant une partie est rangé dans cet objet "state"
let state = {
    running: false, // true = une partie est en cours
    source: null,   // la musique en train d'être jouée
    startTime: 0, // temps AudioContext où la musique commence (t = 0 de la chart)
    notes: [],
    cursor: 0,    // index de la première note pas encore traitée
    //comme ça on reparcourt pas les notes déjà passées à chaque image, ça sert à rien
    weightSum: 0, // somme des poids des jugements (Perfect = 1, Okay = 0.5)
    combo: 0,
    counts: {},     // combien de Perfect, Okay et Miss
    hitErrors: [], // écarts (s) des notes touchées, pour la barre d'erreur
    lastJudgement: null, // le dernier jugement, pour l'afficher au milieu de l'écran
    laneFlash: [-1000, -1000, -1000, -1000], // moment du dernier éclair (ms), loin dans le passé au départ
    onFinish: null, // la fonction à appeler quand la musique est finie (showEnd dans main.js)
};

// Quelles touches sont enfoncées en ce moment, pour le faisceau rose
let pressed = [false, false, false, false];

// Horloge
// L'horloge de référence est celle de l'audio, jamais Date.now ou setTimeout.
// En gros, c'est le truc le plus important pour le jeu de rythme. Si on se base
// sur une autre horloge, les notes se décalent petit à petit par rapport à la
// musique et au bout d'un moment on tape à côté alors qu'on est dans le rythme.
// Le navigateur sait combien de temps le son met à sortir des enceintes,
// et getOutputTimestamp() en tient compte tout seul.
// C'est automatique : rien à régler, contrairement à un offset.
function audioTimeAt(perfMs) {
    let timestamp = audioCtx.getOutputTimestamp();
    if (timestamp.performanceTime > 0) {
        // perfMs est en millisecondes et contextTime en secondes, d'où le / 1000
        return timestamp.contextTime + (perfMs - timestamp.performanceTime) / 1000;
    }
    // Pas encore de son joué : on prend currentTime, et on enlève nous-mêmes
    // le temps que le son met à sortir (outputLatency, mesuré par le navigateur)
    return audioCtx.currentTime - audioCtx.outputLatency;
}

// Le temps dans la musique : 0 = le début de la chanson.
// C'est négatif pendant le compte à rebours au début (genre -2, -1...)
function songTimeAt(perfMs) {
    return audioTimeAt(perfMs) - state.startTime;
}


// Partie

// Lance une partie. buffer = la musique, chart = les notes,
// onFinish = ce qu'il faut faire à la fin (afficher les résultats)
function startGame(buffer, chart, onFinish) {
    stopGame(); // au cas où une partie tournait déjà (quand on fait Échap par exemple)

    // Copie des notes de la chart, triées dans l'ordre du temps
    // On fait une copie pour pouvoir marquer chaque note "judged" (déjà jugée)
    // sans toucher à la chart d'origine, sinon on pourrait pas rejouer
    let notes = [];
    for (let i = 0; i < chart.notes.length; i = i + 1) {
        notes.push({ t: chart.notes[i].t, lane: chart.notes[i].lane, judged: false });
    }
    // sort trie le tableau : si a.t - b.t est négatif, a passe avant b
    notes.sort(function (a, b) {
        return a.t - b.t;
    });

    // On remet tout à zéro
    state.running = true;
    state.notes = notes;
    state.cursor = 0;
    state.weightSum = 0;
    state.combo = 0;
    state.counts = { Perfect: 0, Okay: 0, Miss: 0 };
    state.hitErrors = [];
    state.lastJudgement = null;
    state.onFinish = onFinish;

    // On prépare la musique : source = le lecteur, destination = les enceintes
    let source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    // La musique démarre après 2 secondes, le temps de se préparer
    state.startTime = audioCtx.currentTime + config.leadIn;
    source.start(state.startTime);
    // onended = appelé quand la musique se termine
    source.onended = function () {
        // Seulement si c'est toujours cette musique-là (pas un restart)
        // (quand on fait Échap, l'ancienne musique s'arrête aussi et appelle onended,
        // donc sans ce if l'écran de fin s'afficherait alors qu'on vient de relancer)
        if (state.source == source) {
            finishGame();
        }
    };
    state.source = source;
}

// Coupe la musique et arrête la partie
function stopGame() {
    if (state.source != null) {
        let source = state.source;
        state.source = null; // on l'enlève AVANT de l'arrêter, pour le if de onended juste au dessus
        source.stop();
    }
    state.running = false;
}

// Le nombre de notes déjà jugées depuis le début de la partie
function judgedCount() {
    return state.counts.Perfect + state.counts.Okay + state.counts.Miss;
}

// Le score : 100000 si tout est Perfect, la moitié si tout est Okay...
// On divise par le nombre total de notes, donc le score monte au fur et à mesure
function currentScore() {
    if (state.notes.length == 0) {
        return 0; // sinon on divise par 0 et ça fait n'importe quoi
    }
    return Math.round(config.maxScore * state.weightSum / state.notes.length);
}

// La précision : pareil que le score, sauf qu'on divise par les notes déjà jouées
// (donc ça commence à 100 % et ça descend quand on rate)
function currentAccuracy() {
    let judged = judgedCount();
    if (judged == 0) {
        return 1; // aucune note jouée = 100 %
    }
    return state.weightSum / judged;
}

// Quand la musique est finie : on calcule les résultats et on les envoie à main.js
function finishGame() {
    let results = {
        score: currentScore(),
        accuracy: currentAccuracy(),
        counts: {
            Perfect: state.counts.Perfect,
            Okay: state.counts.Okay,
            Miss: state.counts.Miss,
        },
        // Full combo = zéro Miss (et au moins une note jouée, sinon c'est trop facile)
        fullCombo: state.counts.Miss == 0 && judgedCount() > 0,
    };
    let onFinish = state.onFinish;
    stopGame();
    onFinish(results); // = showEnd(results) dans main.js
}


// Jugement

// Donne un jugement à une note. dt = l'écart en secondes entre l'appui et la note
function judge(note, dt) {
    note.judged = true; // pour pas la juger deux fois

    // On prend la première fenêtre assez large pour cet écart, sinon Miss
    // Math.abs enlève le signe : en avance ou en retard, c'est pareil pour le jugement
    let judgement = miss;
    for (let i = 0; i < config.judgements.length; i = i + 1) {
        if (Math.abs(dt) <= config.judgements[i].window) {
            judgement = config.judgements[i];
            break; // trouvé, pas besoin de regarder les autres
        }
    }

    state.counts[judgement.name] = state.counts[judgement.name] + 1;
    state.weightSum = state.weightSum + judgement.weight;
    if (judgement == miss) {
        state.combo = 0; // raté = le combo retombe à 0
    } else {
        state.combo = state.combo + 1;
        state.hitErrors.push(dt); // on garde l'écart pour la barre d'erreur
        state.laneFlash[note.lane] = performance.now(); // et on déclenche l'éclair sur la lane
    }
    // On retient le dernier jugement et quand il a eu lieu, pour l'animation
    state.lastJudgement = { judgement: judgement, dt: dt, at: performance.now() };
}

// Quand on appuie sur une touche : on cherche la note la plus proche dans cette lane
// lane = quelle touche, t = le moment de l'appui dans la musique
function hit(lane, t) {
    let notes = state.notes;
    for (let i = state.cursor; i < notes.length; i = i + 1) {
        let note = notes[i];
        if (note.t - t > config.missWindow) {
            break; // notes suivantes trop loin
            // (les notes sont triées, donc si celle-là est trop loin, les autres aussi)
        }
        if (note.judged || note.lane != lane) {
            continue; // déjà jugée ou pas la bonne lane, on passe à la suivante
        }
        let dt = t - note.t; // > 0 : en retard, < 0 : en avance
        if (dt > config.missWindow) {
            continue; // déjà ratée, sera comptée par updateMisses
        }
        judge(note, dt);
        return; // une touche = une seule note, on s'arrête là
    }
    // si on arrive ici, on a tapé dans le vide, il se passe rien
}

// Les notes qu'on a laissé passer sans taper deviennent des Miss
// C'est appelé à chaque image dans frame()
function updateMisses(now) {
    let notes = state.notes;
    while (state.cursor < notes.length) {
        let note = notes[state.cursor];
        if (note.judged == false) {
            if (now - note.t <= config.missWindow) {
                break; // cette note peut encore être tapée, on attend
            }
            judge(note, Infinity); // écart infini, donc forcément Miss
        }
        state.cursor = state.cursor + 1; // on avance le curseur à la note d'après
    }
}

// Appuis sur les lanes
// Le clavier ET la manette passent par ces 2 fonctions, comme ça le jeu
// fait pas de différence entre les deux

// lane = 0, 1, 2 ou 3, perfMs = le moment de l'appui (en ms, comme performance.now())
function pressLane(lane, perfMs) {
    if (state.running == false) {
        return; // pas de partie en cours
    }
    pressed[lane] = true;
    hit(lane, songTimeAt(perfMs));
}

function releaseLane(lane) {
    pressed[lane] = false; // on enlève le faisceau rose
}

// Entrées clavier

// Transforme une touche en numéro de lane : z -> 0, e -> 1, o -> 2, p -> 3
// indexOf renvoie -1 si la touche est pas dans la liste (genre "a")
// toLowerCase c'est pour que ça marche aussi avec la majuscule (verr. maj activé)
function laneOf(event) {
    return config.keys.indexOf(event.key.toLowerCase());
}

window.addEventListener("keydown", function (event) {
    let lane = laneOf(event);
    if (lane < 0 || state.running == false) {
        return; // pas une touche du jeu, ou pas de partie en cours
    }
    event.preventDefault(); // empêche le navigateur de faire autre chose avec la touche
    if (event.repeat) {
        return; // touche maintenue enfoncée, on compte qu'une fois
    }
    // event.timeStamp = moment exact de l'appui, indépendant de la framerate
    // si on prenait juste le temps de l'image en cours, on perdrait jusqu'à
    // 16 ms de précision à 60 fps, et sur un Perfect à 40 ms ça se sentirais
    pressLane(lane, event.timeStamp);
});

// Quand on relâche la touche, on enlève le faisceau rose
window.addEventListener("keyup", function (event) {
    let lane = laneOf(event);
    if (lane >= 0) {
        releaseLane(lane);
    }
});

// Rendu
// Tout ce qui suit c'est pour dessiner dans le canvas.
// ctx c'est un peu l'équivalent des fonctions de p5 (fill, rect...) mais en JS normal
let canvas = document.querySelector("#game");
let ctx = canvas.getContext("2d");
let hudScore = document.querySelector("#hud-score");
let hudAcc = document.querySelector("#hud-acc");

// Appelé par main.js au démarrage. Le canvas a plus de pixels réels que sa
// taille affichée sur les écrans haute résolution, pour rester net
// (mon PC est à 125 % dans Windows, donc devicePixelRatio = 1.25 : sans ça le canvas
// est étiré et tout est flou)
function resizeCanvas() {
    let k = window.devicePixelRatio;
    canvas.width = Math.round(config.width * k);   // les vrais pixels
    canvas.height = Math.round(config.height * k);
    canvas.style.width = config.width + "px";      // la taille à l'écran
    canvas.style.height = config.height + "px";
    // et ça, ça fait que je peux continuer à dessiner comme si c'était en 398x720
    ctx.setTransform(k, 0, 0, k, 0, 0);
}

// La position x du bord gauche d'une lane
// ex. lane 0 -> 6, lane 1 -> 6 + 98 = 104, etc.
function laneLeft(lane) {
    return config.separator + lane * (config.laneWidth + config.separator);
}

// Le dégradé gris-blanc-gris pour faire l'effet métal argenté
// (utilisé pour les séparateurs et la ligne de frappe)
function silverGradient(x0, y0, x1, y1) {
    let gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, "#6f737b");
    gradient.addColorStop(0.45, "#f4f5f8"); // le reflet clair au milieu
    gradient.addColorStop(0.6, "#c9ccd3");
    gradient.addColorStop(1, "#7d818a");
    return gradient;
}

// Dessine le fond du terrain : les lanes, les séparateurs, la ligne de frappe...
// En gros tout sauf les notes et les textes
function drawLanes(nowMs) {
    let laneWidth = config.laneWidth;
    let hitLineY = config.hitLineY;

    // On efface tout en repeignant le fond (comme background() en p5)
    ctx.fillStyle = "#151517";
    ctx.fillRect(0, 0, config.width, config.height);

    for (let lane = 0; lane < 4; lane = lane + 1) {
        let x = laneLeft(lane);
        ctx.fillStyle = "#1c1c1f"; // les lanes sont un tout petit peu plus claires que le fond
        ctx.fillRect(x, 0, laneWidth, config.height);

        // Faisceau rose quand la touche est enfoncée
        // (un dégradé qui part de la ligne de frappe et devient transparent vers le haut)
        if (pressed[lane]) {
            let beam = ctx.createLinearGradient(0, hitLineY, 0, hitLineY - 320);
            beam.addColorStop(0, "rgba(255, 79, 160, 0.45)");
            beam.addColorStop(1, "rgba(255, 79, 160, 0)");
            ctx.fillStyle = beam;
            ctx.fillRect(x, hitLineY - 320, laneWidth, 320);
        }
    }

    // Séparateurs argentés
    // <= 4 et pas < 4 parce qu'il y a 5 séparateurs pour 4 lanes
    for (let i = 0; i <= 4; i = i + 1) {
        let x = i * (laneWidth + config.separator);
        ctx.fillStyle = silverGradient(x, 0, x + config.separator, 0);
        ctx.fillRect(x, 0, config.separator, config.height);
    }

    // Ligne de frappe argentée
    ctx.fillStyle = silverGradient(0, hitLineY - 5, 0, hitLineY + 5);
    ctx.fillRect(0, hitLineY - 5, config.width, 10);

    // Éclair blanc-rose sur la lane touchée
    for (let lane = 0; lane < 4; lane = lane + 1) {
        // flash va de 1 (juste après l'appui) à 0 (180 ms après), donc l'éclair s'efface tout seul
        let flash = 1 - (nowMs - state.laneFlash[lane]) / 180;
        if (flash <= 0) {
            continue; // fini, rien à dessiner sur cette lane
        }
        let x = laneLeft(lane);
        let centerX = x + laneWidth / 2;
        // Dégradé rond (radial) : blanc au centre, rose, puis transparent
        let glow = ctx.createRadialGradient(centerX, hitLineY, 0, centerX, hitLineY, laneWidth);
        glow.addColorStop(0, `rgba(255, 255, 255, ${flash})`);
        glow.addColorStop(0.4, `rgba(255, 120, 190, ${flash * 0.7})`);
        glow.addColorStop(1, "rgba(255, 120, 190, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 20, hitLineY - laneWidth, laneWidth + 40, laneWidth * 2);
    }

    // Lettre de la touche sous chaque lane
    ctx.font = "500 14px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#6f737b";
    for (let lane = 0; lane < 4; lane = lane + 1) {
        ctx.fillText(config.keys[lane].toUpperCase(), laneLeft(lane) + laneWidth / 2, hitLineY + 32);
    }
}

// Dessine UNE note. x, y = sa position, style = blanche ou rose
function drawNote(x, y, style) {
    let top = y - config.noteHeight / 2; // y c'est le centre de la note, donc on remonte de la moitié
    let gradient = ctx.createLinearGradient(0, top, 0, top + config.noteHeight);
    gradient.addColorStop(0, style.top);
    gradient.addColorStop(0.45, style.mid);
    gradient.addColorStop(1, style.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, top, config.laneWidth, config.noteHeight);
    // Biseau : reflet en haut, arête sombre en bas
    // (ça donne un effet 3D)
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(x, top, config.laneWidth, 2);
    ctx.fillStyle = style.edge;
    ctx.fillRect(x, top + config.noteHeight - 3, config.laneWidth, 3);
}

// Dessine toutes les notes visibles à l'écran
function drawNotes(now) {
    let notes = state.notes;
    let visibleAhead = config.hitLineY / config.scrollSpeed; // secondes visibles à l'écran
    // (630 px / 800 px par seconde = une note met environ 0.8 s à descendre jusqu'à la ligne)
    for (let i = state.cursor; i < notes.length; i = i + 1) {
        let note = notes[i];
        if (note.t - now > visibleAhead) {
            break; // celle-là est encore au-dessus de l'écran, et toutes les suivantes aussi
        }
        if (note.judged) {
            continue; // déjà tapée, on la dessine plus
        }
        // La formule importante : plus la note est loin dans le temps, plus elle est haute.
        // Quand note.t == now, (note.t - now) = 0 donc y = hitLineY : pile sur la ligne
        let y = config.hitLineY - (note.t - now) * config.scrollSpeed;
        drawNote(laneLeft(note.lane), y, noteStyles[note.lane]);
    }
}

// Affiche le combo et le dernier jugement (Perfect / Okay / Miss) au milieu
function drawCombo(nowMs) {
    let centerX = config.width / 2;
    // Positions mesurées depuis la ligne de frappe : elles suivent si on la déplace
    let comboY = config.hitLineY - 370;
    let judgementY = config.hitLineY - 280;
    ctx.textAlign = "center";

    // Le combo s'affiche qu'à partir de 2, pratique générale dans les jeux de rythme
    if (state.combo > 1) {
        ctx.font = "700 72px Orbitron, sans-serif";
        // Dégradé argenté pour le chiffre, comme le reste du jeu
        let gradient = ctx.createLinearGradient(0, comboY - 70, 0, comboY);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.5, "#c4c7ce");
        gradient.addColorStop(0.52, "#8c9098");
        gradient.addColorStop(1, "#e6e7eb");
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.85; // un peu transparent pour pas cacher les notes derrière
        ctx.fillText(state.combo, centerX, comboY);
        ctx.font = "500 14px Orbitron, sans-serif";
        ctx.fillText("COMBO", centerX, comboY + 24);
        ctx.globalAlpha = 1; // on remet l'opacité normale sinon tout le reste est transparent aussi
    }

    let last = state.lastJudgement;
    if (last == null) {
        return; // encore aucune note jouée
    }
    let age = (nowMs - last.at) / 450; // de 0 à 1 pendant 450 ms
    if (age >= 1) {
        return; // le texte a déjà disparu
    }
    let pop = 1 + 0.15 * Math.max(0, 1 - age * 4); // léger rebond à l'apparition
    // save() / restore() : on sauvegarde les réglages du canvas, on fait nos
    // déplacements/zoom, et après on revient comme avant
    ctx.save();
    ctx.translate(centerX, judgementY - age * 8); // le texte monte un tout petit peu en disparaissant
    ctx.scale(pop, pop);
    ctx.globalAlpha = 1 - age * age; // et il devient transparent
    ctx.font = "700 36px Orbitron, sans-serif";
    ctx.shadowColor = last.judgement.color; // une ombre de la même couleur = effet néon
    ctx.shadowBlur = 16;
    ctx.fillStyle = last.judgement.color;
    ctx.fillText(last.judgement.name, 0, 0);
    ctx.shadowBlur = 0;
    // Sous le jugement, l'écart en ms (sauf pour Miss, ça veut rien dire)
    if (last.judgement != miss) {
        ctx.font = "500 13px Orbitron, sans-serif";
        ctx.fillStyle = "#c4c7ce";
        let ms = Math.round(last.dt * 1000); // secondes -> millisecondes
        let text = ms + " ms";
        if (ms > 0) {
            text = "+" + text; // + = en retard (le - pour l'avance est déjà dans le nombre)
        }
        ctx.fillText(text, 0, 22);
    }
    ctx.restore();
}

// Barre d'erreur : montre si on tape en avance (gauche) ou en retard (droite)
// C'est pratique pour voir si on a tendance à taper trop tôt ou trop tard
function drawErrorBar() {
    let centerX = config.width / 2;
    let y = config.hitLineY + 62; // sous la ligne de frappe et les lettres
    let scale = (config.width / 2 - 30) / config.missWindow; // px par seconde

    // Zones Okay puis Perfect par-dessus
    // (la boucle va à l'envers, de la fin du tableau au début, pour dessiner la
    // plus grande zone d'abord, sinon elle cacherait la petite)
    for (let i = config.judgements.length - 1; i >= 0; i = i - 1) {
        let judgement = config.judgements[i];
        ctx.fillStyle = judgement.color;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(centerX - judgement.window * scale, y - 3, judgement.window * scale * 2, 6);
    }

    // Les 25 derniers appuis, les plus anciens plus transparents
    // slice(-25) = les 25 derniers éléments du tableau
    let recent = state.hitErrors.slice(-25);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < recent.length; i = i + 1) {
        ctx.globalAlpha = (i + 1) / recent.length; // le dernier appui est complètement opaque
        ctx.fillRect(centerX + recent[i] * scale - 1, y - 9, 2, 18); // un petit trait blanc
    }
    ctx.globalAlpha = 1;
}

// Met à jour le score et la précision à gauche de l'écran
function updateHud() {
    hudScore.textContent = String(currentScore()).padStart(5, "0");
    hudAcc.textContent = (currentAccuracy() * 100).toFixed(2) + "%";
}

// Boucle d'affichage, comme draw() en p5 : appelée à chaque image
// (environ 60 fois par seconde, ça dépend de l'écran)
function frame(nowMs) {
    if (state.running) {
        let now = songTimeAt(nowMs); // où on en est dans la musique
        updateMisses(now);
        // L'ordre compte : ce qui est dessiné en dernier passe par-dessus le reste
        drawLanes(nowMs);
        drawNotes(now);
        drawCombo(nowMs);
        drawErrorBar();
        updateHud();

        // Compte à rebours avant le début de la musique
        // (now est négatif pendant les 2 premières secondes, ex. -1.3 -> on affiche 2)
        if (now < 0) {
            ctx.textAlign = "center";
            ctx.font = "700 64px Orbitron, sans-serif";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(Math.ceil(-now), config.width / 2, config.hitLineY - 330);
        }
    }
    // On redemande une image, ce qui rappelle frame() à la prochaine image, et ainsi de suite
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame); // et on lance la boucle une première fois
