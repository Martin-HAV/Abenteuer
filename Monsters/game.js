// game.js
// Zentrale Spiellogik. Lädt cards.json und deck.json per fetch()
// und implementiert den kompletten Rundenablauf im Browser.

// ---------- Konstanten ----------

const ELEMENT_STAERKER_ALS = {
  fire: "plant",
  plant: "water",
  water: "fire"
};
const ELEMENT_BONUS = 1.5;

const ELEMENT_LABEL = { fire: "Feuer", water: "Wasser", plant: "Pflanze" };

// ---------- Globaler Zustand ----------

let CARDS = {};       // { cardId: {name, text, image, strength, element} }
let state = null;     // gesamter Spielzustand, siehe initState()

// ---------- Laden ----------

async function ladeDaten() {
  const [cardsRes, deckRes] = await Promise.all([
    fetch("cards.json"),
    fetch("deck.json")
  ]);
  CARDS = await cardsRes.json();
  const decks = await deckRes.json();
  return decks;
}

// ---------- Hilfsfunktionen ----------

function mische(array) {
  const kopie = array.slice();
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

function log(text) {
  const el = document.getElementById("log");
  const zeile = document.createElement("div");
  zeile.textContent = text;
  el.appendChild(zeile);
  el.scrollTop = el.scrollHeight;
}

// effektive Stärke inkl. Elementbonus gegen ein bestimmtes gegnerisches Element
function effektiveStaerke(cardId, gegnerElement) {
  const karte = CARDS[cardId];
  let staerke = karte.strength;
  if (ELEMENT_STAERKER_ALS[karte.element] === gegnerElement) {
    staerke += ELEMENT_BONUS;
  }
  return staerke;
}

// ---------- Spieler-Struktur ----------

function erstelleSpieler(deckIds) {
  const gemischt = mische(deckIds);
  const spieler = {
    ziehstapel: gemischt,
    hand: [],       // bis zu 3 aufgedeckte Karten
    ablage: []
  };
  fuelleHand(spieler);
  return spieler;
}

// zieht Karten nach, bis die Hand 3 Karten hat (oder keine mehr verfügbar sind)
function fuelleHand(spieler) {
  while (spieler.hand.length < 3) {
    stelleZiehstapelSicher(spieler);
    if (spieler.ziehstapel.length === 0) break;
    spieler.hand.push(spieler.ziehstapel.shift());
  }
}

// wenn der Ziehstapel leer ist, Ablagestapel mischen und zum neuen Ziehstapel machen
function stelleZiehstapelSicher(spieler) {
  if (spieler.ziehstapel.length === 0 && spieler.ablage.length > 0) {
    log("Ablagestapel wird gemischt und zum neuen Nachziehstapel.");
    spieler.ziehstapel = mische(spieler.ablage);
    spieler.ablage = [];
  }
}

function hatKeineKarten(spieler) {
  return spieler.ziehstapel.length === 0 && spieler.hand.length === 0 && spieler.ablage.length === 0;
}

// entfernt eine Karte aus der Hand (per index) und füllt danach wieder auf
function spieleKarteAusHand(spieler, index) {
  const cardId = spieler.hand.splice(index, 1)[0];
  fuelleHand(spieler);
  return cardId;
}

// ---------- Initialisierung ----------

function initState(decks) {
  state = {
    player: erstelleSpieler(decks.deck1),
    computer: erstelleSpieler(decks.deck2),
    tisch: [],           // Karten, die aktuell im Kampf liegen (Ablagestapel-Kandidaten)
    phase: "computerDeckt", // computerDeckt | spielerWaehlt | krieg | spielEnde
    naechsterStarter: "computer", // wer als nächstes aufdeckt: "computer" | "player"
    computerOffeneKarte: null,
    spielerOffeneKarte: null
  };
}

// ---------- Rendering ----------

function render() {
  document.getElementById("computer-stapel-info").textContent =
    `Nachziehstapel: ${state.computer.ziehstapel.length} | Ablagestapel: ${state.computer.ablage.length}`;
  document.getElementById("player-stapel-info").textContent =
    `Nachziehstapel: ${state.player.ziehstapel.length} | Ablagestapel: ${state.player.ablage.length}`;
  document.getElementById("computer-hand-info").textContent =
    `Karten auf der Hand: ${state.computer.hand.length}`;

  renderSpielerHand();
  renderTisch();
}

function renderSpielerHand() {
  const container = document.getElementById("player-hand");
  container.innerHTML = "";
  const auswaehlbar = state.phase === "spielerWaehlt" || state.phase === "krieg" || state.phase === "spielerDecktZuerst";

  state.player.hand.forEach((cardId, index) => {
    const karte = CARDS[cardId];
    const div = document.createElement("div");
    div.className = "karte" + (auswaehlbar ? "" : " disabled");
    div.innerHTML = `
      <img src="${karte.image}" alt="${karte.name}">
      <div class="name">${karte.name}</div>
      <div class="staerke">Stärke: ${karte.strength}</div>
      <div class="element">${ELEMENT_LABEL[karte.element]}</div>
      <div class="flavor">${karte.text}</div>
    `;
    if (auswaehlbar) {
      div.addEventListener("click", () => waehleSpielerKarte(index));
    }
    container.appendChild(div);
  });
}

function renderTisch() {
  const mitte = document.getElementById("mitte");
  mitte.innerHTML = "";

  if (state.computerOffeneKarte) {
    mitte.appendChild(erstelleTischKarte(state.computerOffeneKarte, "Computer"));
  }
  if (state.spielerOffeneKarte) {
    mitte.appendChild(erstelleTischKarte(state.spielerOffeneKarte, "Spieler"));
  }
}

function erstelleTischKarte(cardId, besitzer) {
  const karte = CARDS[cardId];
  const div = document.createElement("div");
  div.className = "karte";
  div.innerHTML = `
    <div class="name">${besitzer}</div>
    <img src="${karte.image}" alt="${karte.name}">
    <div class="name">${karte.name}</div>
    <div class="staerke">Stärke: ${karte.strength}</div>
    <div class="element">${ELEMENT_LABEL[karte.element]}</div>
  `;
  return div;
}

// ---------- Rundenablauf ----------

function starteRunde() {
  state.computerOffeneKarte = null;
  state.spielerOffeneKarte = null;

  if (state.naechsterStarter === "computer") {
    state.phase = "computerDeckt";
    render();
    setTimeout(computerDecktAuf, 700);
  } else {
    state.phase = "spielerDecktZuerst";
    render();
    log("Du hast die letzte Runde gewonnen und deckst zuerst auf. Wähle eine Karte.");
  }
}

// Fall A: Computer deckt zuerst auf, danach wählt der Spieler eine Gegenkarte
function computerDecktAuf() {
  if (state.computer.hand.length === 0) {
    // Computer kann keine Karte aufdecken -> verliert den (leeren) Tisch, Spielende prüfen
    verliertStapel("computer");
    return;
  }
  const index = Math.floor(Math.random() * state.computer.hand.length);
  state.computerOffeneKarte = spieleKarteAusHand(state.computer, index);
  log(`Computer deckt auf: ${CARDS[state.computerOffeneKarte].name} (Stärke ${CARDS[state.computerOffeneKarte].strength}, ${ELEMENT_LABEL[CARDS[state.computerOffeneKarte].element]})`);
  state.phase = "spielerWaehlt";
  render();
}

function waehleSpielerKarte(index) {
  if (state.phase === "spielerDecktZuerst") {
    // Spieler deckt zuerst auf (weil er die letzte Runde gewonnen hat)
    state.spielerOffeneKarte = spieleKarteAusHand(state.player, index);
    log(`Du deckst auf: ${CARDS[state.spielerOffeneKarte].name}`);
    state.phase = "computerAntwortet";
    render();
    setTimeout(computerAntwortet, 700);
    return;
  }

  if (state.phase !== "spielerWaehlt" && state.phase !== "krieg") return;

  state.spielerOffeneKarte = spieleKarteAusHand(state.player, index);
  log(`Du wählst: ${CARDS[state.spielerOffeneKarte].name}`);
  render();
  setTimeout(werteRundeAus, 500);
}

// Fall B: Spieler hat zuerst aufgedeckt, jetzt antwortet der Computer
function computerAntwortet() {
  if (state.computer.hand.length === 0) {
    verliertStapel("computer");
    return;
  }
  const index = Math.floor(Math.random() * state.computer.hand.length);
  state.computerOffeneKarte = spieleKarteAusHand(state.computer, index);
  log(`Computer antwortet mit: ${CARDS[state.computerOffeneKarte].name}`);
  render();
  setTimeout(werteRundeAus, 500);
}

function werteRundeAus() {
  const spielerKarte = CARDS[state.spielerOffeneKarte];
  const computerKarte = CARDS[state.computerOffeneKarte];

  const spielerStaerke = effektiveStaerke(state.spielerOffeneKarte, computerKarte.element);
  const computerStaerke = effektiveStaerke(state.computerOffeneKarte, spielerKarte.element);

  log(`Vergleich: Du ${spielerStaerke} vs. Computer ${computerStaerke}`);

  state.tisch.push(state.spielerOffeneKarte, state.computerOffeneKarte);
  state.spielerOffeneKarte = null;
  state.computerOffeneKarte = null;

  if (spielerStaerke > computerStaerke) {
    gewinneTisch("player");
  } else if (computerStaerke > spielerStaerke) {
    gewinneTisch("computer");
  } else {
    log("Gleichstand! Es kommt zum Krieg – beide wählen eine weitere Karte.");
    starteKrieg();
  }
}

function starteKrieg() {
  // Prüfen ob beide noch eine Karte haben, sonst verliert der jeweilige den Tisch
  if (state.player.hand.length === 0 && state.computer.hand.length === 0) {
    // niemand kann mehr wählen -> Tisch bleibt liegen (Sonderfall), Spiel geht mit neuer Runde weiter
    log("Beide Spieler haben keine Karten mehr für den Krieg. Der Tisch bleibt unentschieden liegen.");
    naechsteRundeVorbereiten(null);
    return;
  }
  if (state.player.hand.length === 0) {
    verliertStapel("player");
    return;
  }
  if (state.computer.hand.length === 0) {
    verliertStapel("computer");
    return;
  }

  state.phase = "krieg";
  render();
  setTimeout(() => {
    const index = Math.floor(Math.random() * state.computer.hand.length);
    state.computerOffeneKarte = spieleKarteAusHand(state.computer, index);
    log(`Computer legt für den Krieg: ${CARDS[state.computerOffeneKarte].name}`);
    render();
    log("Wähle deine Krieg-Karte.");
  }, 700);
}

function gewinneTisch(gewinner) {
  const spieler = gewinner === "player" ? state.player : state.computer;
  spieler.ablage.push(...state.tisch);
  log(`${gewinner === "player" ? "Du" : "Computer"} gewinnst den Stapel (${state.tisch.length} Karten).`);
  state.tisch = [];
  naechsteRundeVorbereiten(gewinner);
}

// wenn ein Spieler in Wahlsituation keine Karte mehr hat, verliert er den aktuellen Tisch
function verliertStapel(verlierer) {
  const gewinner = verlierer === "player" ? "computer" : "player";
  log(`${verlierer === "player" ? "Du hast" : "Computer hat"} keine Karte mehr zum Auswählen und verliert den Stapel.`);
  if (state.tisch.length > 0) {
    const empfaenger = gewinner === "player" ? state.player : state.computer;
    empfaenger.ablage.push(...state.tisch);
    state.tisch = [];
  }
  naechsteRundeVorbereiten(gewinner);
}

function naechsteRundeVorbereiten(gewinner) {
  pruefeSpielende();
  if (state.phase === "spielEnde") return;

  state.naechsterStarter = gewinner || "computer";
  setTimeout(starteRunde, 900);
}

function pruefeSpielende() {
  if (hatKeineKarten(state.player)) {
    state.phase = "spielEnde";
    log("Du hast keine Karten mehr. Der Computer gewinnt das Spiel!");
    render();
  } else if (hatKeineKarten(state.computer)) {
    state.phase = "spielEnde";
    log("Der Computer hat keine Karten mehr. Du gewinnst das Spiel!");
    render();
  }
}

// ---------- Start ----------

async function starteSpiel() {
  const decks = await ladeDaten();
  initState(decks);
  log("Spiel gestartet.");
  render();
  starteRunde();
}

starteSpiel();
