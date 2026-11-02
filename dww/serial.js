// serial.js pour la manette Arduino branchée en USB
// L'Arduino envoie une seule lettre à chaque fois : en majuscule quand on appuie
// sur un bouton ("A"), en minuscule quand on le relâche ("a").
// on les lit avec Web Serial API pour les transformer en appuis sur les lanes

let controllerButton = document.querySelector("#controller-button");

// Quelle lettre va dans quelle lane
let pressLanes = { A: 0, B: 1, C: 2, D: 3 };   // majuscules = appui
let releaseLanes = { a: 0, b: 1, c: 2, d: 3 }; // minuscules = relâchement

// Le clic sur "Connect controller"
// le navigateur oblige à cliquer pour choisir le port, on peut pas le faire tout seul au chargement
controllerButton.addEventListener("click", async function () {
    controllerButton.blur(); // sinon Espace ou Entrée recliquerait sur le bouton
    audioCtx.resume();       // le clic compte comme une action du joueur, donc le son a le droit de démarrer

    // Ouvre la fenêtre du navigateur où on choisit le port de l'Arduino
    let port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 }); // même vitesse que Serial.begin(9600) dans l'Arduino

    controllerButton.textContent = "Controller connected";
    controllerButton.disabled = true;
    readController(port);
});

// Lit tout ce que l'Arduino envoie, en boucle, jusqu'à ce qu'on la débranche
async function readController(port) {
    // L'Arduino envoie des octets, le TextDecoderStream les transforme en texte
    let decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    let reader = decoder.readable.getReader();

    while (true) {
        let result = await reader.read();
        if (result.done) {
            break;
        }
        // On peut recevoir plusieurs lettres d'un coup (genre "Aa"),
        // donc on les traite une par une
        for (let i = 0; i < result.value.length; i = i + 1) {
            handleChar(result.value[i]);
        }
    }
}

// Transforme une lettre de l'Arduino en appui ou en relâchement de lane
function handleChar(char) {
    if (char in pressLanes) {
        anyButton();                                // pour lancer ou relancer la partie (dans main.js)
        pressLane(pressLanes[char], performance.now()); // et l'appui sur la lane (dans game.js)
    } else if (char in releaseLanes) {
        releaseLane(releaseLanes[char]);
    }
    // tout le reste on l'ignore
}
