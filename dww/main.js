// main.js = tout ce qui est autour du gameplay : la taille de l'écran, le chargement
// de la musique, l'écran de départ et l'écran de fin.
// Le gameplay est dans game.js.

// Le navigateur interdit de lancer le son sans action de l'utilisateur,
// d'où l'appui sur une touche pour démarrer.

// Je récupère tous les éléments HTML dont j'ai besoin d'un coup
let stage = document.querySelector("#stage");
let overlayStart = document.querySelector("#overlay-start"); // le "Press any button to start"
let overlayEnd = document.querySelector("#overlay-end");     // le panneau de fin
let endRank = document.querySelector("#end-rank");
let endFullCombo = document.querySelector("#end-fc");
let endScore = document.querySelector("#end-score");
let endPerfect = document.querySelector("#end-perfect");
let endOkay = document.querySelector("#end-okay");
let endMiss = document.querySelector("#end-miss");
let endAccuracy = document.querySelector("#end-acc");


// Scène de 1280x720, mise à l'échelle pour tenir dans la fenêtre

// Tout le jeu est fait pour un écran de 1280x720, et après on le rétrécit
// ou on l'agrandit pour qu'il rentre dans la fenêtre, peu importe sa taille
let stageWidth = 1280;
let stageHeight = 720;

stage.style.width = stageWidth + "px";
stage.style.height = stageHeight + "px";
resizeCanvas();               // règle la taille du canvas (dans game.js)
drawLanes(performance.now()); // dessine les lanes vides tout de suite, sinon c'est tout noir avant de jouer

function fitStage() {
    // Ex. : fenêtre de 1536 de large -> 1536 / 1280 = 1.2
    let scaleX = window.innerWidth / stageWidth;
    let scaleY = window.innerHeight / stageHeight;
    // On garde le plus petit des deux pour que tout rentre
    // (si on prend le plus grand, ça dépasse en haut et en bas, j'ai testé)
    let scale = Math.min(scaleX, scaleY);
    // translate(-50%, -50%) ça centre la scène, et scale() ça change sa taille
    stage.style.transform = "translate(-50%, -50%) scale(" + scale + ")";
}
fitStage(); // une première fois au lancement
window.addEventListener("resize", fitStage); // et à chaque fois qu'on change la taille de la fenêtre

// On redessine une fois la police Orbitron chargée, pour les lettres des touches
// (la police met un peu de temps à arriver depuis Google Fonts, donc au tout début
// les lettres Z E O P sont écrites avec une police de base, c'est moche)
document.fonts.ready.then(function () {
    drawLanes(performance.now());
});


// Partie

// Musique et chart chargées tout de suite
// La "chart" c'est la liste de toutes les notes : à quel moment (t, en secondes)
// et dans quelle lane (0, 1, 2 ou 3). Elle est dans chart.json.
let songBuffer = null; // la musique une fois décodée, prête à être jouée
let chart = null;

// async/await : ça permet d'attendre que le fichier soit téléchargé avant de passer
// à la ligne d'après, sans bloquer toute la page pendant ce temps
async function loadSong() {
    let musicResponse = await fetch("musique.wav");
    let musicData = await musicResponse.arrayBuffer();         // le fichier en données brutes
    songBuffer = await audioCtx.decodeAudioData(musicData);    // transformé en son jouable

    let chartResponse = await fetch("chart.json");
    chart = await chartResponse.json(); // le JSON devient un objet JavaScript normal
}
// On lance le chargement direct, pendant que le joueur lit "Press any button to start"
let songLoading = loadSong();

// Pour savoir où on en est. Il y a 3 étapes possibles :
// "ready" = écran de départ, "playing" = en train de jouer, "done" = écran de fin
let phase = "ready";
let replayAt = 0; // à partir de quand on a le droit de relancer une partie

async function play() {
    phase = "playing";
    overlayStart.hidden = true; // on cache le texte de départ
    overlayEnd.hidden = true;   // et le panneau de fin si on rejoue
    audioCtx.resume();          // "réveille" le son, c'est là qu'on a besoin de l'appui sur une touche
    await songLoading; // attend la fin du chargement si besoin
    startGame(songBuffer, chart, showEnd); // c'est parti (la fonction est dans game.js)
}

// Donne la lettre du rang selon la précision
// accuracy c'est entre 0 et 1, donc 0.98 = 98 %
// on teste du plus haut au plus bas
function rankFor(accuracy) {
    if (accuracy >= 0.98) {
        return "S+";
    }
    if (accuracy >= 0.95) {
        return "S";
    }
    if (accuracy >= 0.90) {
        return "A";
    }
    if (accuracy >= 0.80) {
        return "B";
    }
    if (accuracy >= 0.70) {
        return "C";
    }
    return "D"; // en dessous de 70 %, c'est D
}

// Appelée par game.js quand la musique est finie, avec les résultats de la partie
function showEnd(results) {
    phase = "done";
    endRank.textContent = rankFor(results.accuracy);
    endFullCombo.hidden = !results.fullCombo; // "Full Combo!" seulement si on a raté aucune note
    endScore.textContent = String(results.score).padStart(5, "0"); // padStart ça rajoute des 0 devant : 950 -> 00950
    endPerfect.textContent = results.counts.Perfect;
    endOkay.textContent = results.counts.Okay;
    endMiss.textContent = results.counts.Miss;
    // toFixed(2) = 2 chiffres après la virgule
    endAccuracy.textContent = `Accuracy ${(results.accuracy * 100).toFixed(2)}%`;
    overlayEnd.hidden = false; // et on affiche le panneau
    replayAt = performance.now() + 1000; // évite de relancer par erreur
    // (genre si on spamme les touches à la fin de la musique, ça relancerait
    // direct sans qu'on ait le temps de voir son score)
}

// Appelée à chaque appui, que ce soit une touche du clavier ou un bouton de la manette
function anyButton() {
    if (phase == "ready") {
        play(); // n'importe quelle touche lance la partie
    } else if (phase == "done" && performance.now() >= replayAt) {
        play(); // pareil sur l'écran de fin, mais après 1 seconde
    }
}

// Toutes les touches du clavier passent par là
window.addEventListener("keydown", function (event) {
    // event.repeat = quand on reste appuyé sur une touche, le navigateur renvoie
    // la touche en boucle. On veut juste le premier appui.
    if (event.repeat) {
        return;
    }
    if (phase != "playing") {
        anyButton();
    } else if (event.key == "Escape") {
        // Échap pendant la partie = on recommence depuis le début
        stopGame();
        play();
    }
});
