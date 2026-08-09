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
let VOKABELN = { woerter: [], audios: [] }; // aus vokabeln/vokabel.json
let state = null;     // gesamter Spielzustand, siehe initState()

// ---------- Laden ----------

async function ladeDaten() {
  const [cardsRes, deckRes, vokabelRes] = await Promise.all([
    fetch("cards.json"),
    fetch("deck.json"),
    fetch("vokabeln/vokabel.json")
  ]);
  CARDS = await cardsRes.json();
  const decks = await deckRes.json();
  VOKABELN = await vokabelRes.json();
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
// basisUeberschreiben: optionaler Wert statt karte.strength (z.B. die im Vokabel-Check erreichte Punktzahl)
function effektiveStaerke(cardId, gegnerElement, basisUeberschreiben) {
  const karte = CARDS[cardId];
  let staerke = basisUeberschreiben !== undefined ? basisUeberschreiben : karte.strength;
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
    phase: "computerDeckt", // computerDeckt | spielerWaehlt | krieg | rundenErgebnis | vokabelAbfrage | spielEnde
    naechsterStarter: "computer", // wer als nächstes aufdeckt: "computer" | "player"
    computerOffeneKarte: null,
    spielerOffeneKarte: null,
    rundenErgebnis: null,      // { spielerStaerke, computerStaerke, gewinner } während der Ergebnisanzeige
    vokabelAufgaben: null,     // aktuelle Vokabel-Aufgaben während der Abfrage
    vokabelWeiter: null,       // Callback, der nach der Abfrage weiterläuft
    vokabelPunkte: 0,          // Ergebnis der aktuellen Abfrage
    vokabelAusgewertet: false, // ob "Abschicken" schon gedrückt wurde
    spielerVokabelPunkte: 0,   // im Vokabel-Check erreichte Stärke der aktuellen Spielerkarte
    vokabelStatistik: erstelleVokabelStatistik() // pro Vokabel: { richtig, falsch, zuletzt }
  };
}

// legt für jede Vokabel einen Zähler an: wie oft richtig/falsch, und der letzte Status
function erstelleVokabelStatistik() {
  const stat = {};
  VOKABELN.vokabeln.forEach(wort => {
    stat[wort] = { richtig: 0, falsch: 0, zuletzt: null }; // zuletzt: null | "richtig" | "falsch"
  });
  return stat;
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

  // Sicherstellen, dass beide Hände so weit wie möglich aufgefüllt sind
  // (löst bei Bedarf auch das Mischen des Ablagestapels zum neuen Nachziehstapel aus),
  // bevor geprüft wird, ob jemand tatsächlich keine Karten mehr hat.
  fuelleHand(state.player);
  fuelleHand(state.computer);
  pruefeSpielende();
  if (state.phase === "spielEnde") return;

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
    const cardId = spieleKarteAusHand(state.player, index);
    state.spielerOffeneKarte = cardId;
    log(`Du deckst auf: ${CARDS[cardId].name}`);
    starteVokabelAbfrage(cardId, () => {
      state.phase = "computerAntwortet";
      render();
      setTimeout(computerAntwortet, 700);
    });
    return;
  }

  if (state.phase !== "spielerWaehlt" && state.phase !== "krieg") return;

  const cardId = spieleKarteAusHand(state.player, index);
  state.spielerOffeneKarte = cardId;
  log(`Du wählst: ${CARDS[cardId].name}`);
  starteVokabelAbfrage(cardId, () => {
    render();
    setTimeout(werteRundeAus, 500);
  });
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

  const spielerStaerke = effektiveStaerke(state.spielerOffeneKarte, computerKarte.element, state.spielerVokabelPunkte);
  const computerStaerke = effektiveStaerke(state.computerOffeneKarte, spielerKarte.element);

  log(`Vergleich: Du ${spielerStaerke} (davon ${state.spielerVokabelPunkte} durch Vokabeln) vs. Computer ${computerStaerke}`);

  let gewinner;
  if (spielerStaerke > computerStaerke) gewinner = "player";
  else if (computerStaerke > spielerStaerke) gewinner = "computer";
  else gewinner = null; // Gleichstand -> Krieg

  zeigeRundenErgebnis(spielerStaerke, computerStaerke, gewinner);
}

// zeigt beide Karten mit Bild an und markiert den Gewinner; wartet auf Klick auf "Weiter"
function zeigeRundenErgebnis(spielerStaerke, computerStaerke, gewinner) {
  state.rundenErgebnis = { spielerStaerke, computerStaerke, gewinner };
  state.phase = "rundenErgebnis";
  render();
  renderRundenErgebnis();
}

function renderRundenErgebnis() {
  let overlay = document.getElementById("ergebnis-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "ergebnis-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);" +
      "display:flex;align-items:center;justify-content:center;z-index:1000;";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = "";

  const { spielerStaerke, computerStaerke, gewinner } = state.rundenErgebnis;
  let spielerStatus, computerStatus;
  if (gewinner === "player") {
    spielerStatus = "gewinner"; computerStatus = "verlierer";
  } else if (gewinner === "computer") {
    spielerStatus = "verlierer"; computerStatus = "gewinner";
  } else {
    spielerStatus = "unentschieden"; computerStatus = "unentschieden";
  }

  const box = document.createElement("div");
  box.style.cssText =
    "background:#222;padding:20px;border-radius:10px;max-width:600px;width:90%;font-family:sans-serif;text-align:center;";

  const titel = document.createElement("h3");
  titel.style.color = "#eee";
  if (gewinner === "player") titel.textContent = "Du gewinnst diese Runde!";
  else if (gewinner === "computer") titel.textContent = "Computer gewinnt diese Runde!";
  else titel.textContent = "Unentschieden – es kommt zum Krieg!";
  box.appendChild(titel);

  const reihe = document.createElement("div");
  reihe.style.cssText = "display:flex;justify-content:center;gap:30px;margin-top:15px;flex-wrap:wrap;";
  reihe.appendChild(erstelleErgebnisKarte(state.spielerOffeneKarte, "Du", spielerStaerke, spielerStatus));
  reihe.appendChild(erstelleErgebnisKarte(state.computerOffeneKarte, "Computer", computerStaerke, computerStatus));
  box.appendChild(reihe);

  const weiterBtn = document.createElement("button");
  weiterBtn.textContent = "Weiter";
  weiterBtn.style.cssText =
    "margin-top:20px;padding:8px 20px;cursor:pointer;background:#7fd;border:none;border-radius:6px;font-weight:bold;";
  weiterBtn.addEventListener("click", schliesseRundenErgebnis);
  box.appendChild(weiterBtn);

  overlay.appendChild(box);
}

function erstelleErgebnisKarte(cardId, besitzer, staerke, status) {
  const karte = CARDS[cardId];
  const farben = { gewinner: "#4caf50", verlierer: "#e53935", unentschieden: "#ffd166" };
  const rahmenfarbe = farben[status];
  const div = document.createElement("div");
  div.style.cssText = `width:150px;background:#333;border:3px solid ${rahmenfarbe};border-radius:8px;padding:10px;`;
  div.innerHTML = `
    <div style="font-weight:bold;color:#eee;">${besitzer}${status === "gewinner" ? " 🏆" : ""}</div>
    <img src="${karte.image}" alt="${karte.name}" style="width:100%;height:100px;object-fit:cover;border-radius:4px;margin:6px 0;">
    <div style="font-weight:bold;color:#eee;">${karte.name}</div>
    <div style="color:${rahmenfarbe};font-weight:bold;">Stärke: ${staerke}</div>
    <div style="color:#9ad;font-size:0.85em;">${ELEMENT_LABEL[karte.element]}</div>
  `;
  return div;
}

// wird nach Klick auf "Weiter" ausgeführt: verteilt die Karten wie zuvor und macht weiter
function schliesseRundenErgebnis() {
  const overlay = document.getElementById("ergebnis-overlay");
  if (overlay) overlay.remove();

  const { gewinner } = state.rundenErgebnis;
  state.rundenErgebnis = null;

  state.tisch.push(state.spielerOffeneKarte, state.computerOffeneKarte);
  state.spielerOffeneKarte = null;
  state.computerOffeneKarte = null;

  if (gewinner === "player") {
    gewinneTisch("player");
  } else if (gewinner === "computer") {
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
  if (state.phase === "spielEnde") return; // schon beendet, nicht doppelt auswerten

  if (hatKeineKarten(state.player)) {
    state.phase = "spielEnde";
    log("Du hast keine Karten mehr. Der Computer gewinnt das Spiel!");
    zeigeVokabelStatistik();
    render();
  } else if (hatKeineKarten(state.computer)) {
    state.phase = "spielEnde";
    log("Der Computer hat keine Karten mehr. Du gewinnst das Spiel!");
    zeigeVokabelStatistik();
    render();
  }
}

// listet am Spielende alle Vokabeln auf, die jedes Mal richtig eingegeben wurden
function zeigeVokabelStatistik() {
  const perfekte = Object.entries(state.vokabelStatistik)
    .filter(([, stat]) => stat.richtig > 0 && stat.falsch === 0)
    .sort((a, b) => b[1].richtig - a[1].richtig);

  if (perfekte.length === 0) {
    log("Keine Vokabel wurde durchgehend richtig eingegeben.");
    return;
  }

  log("Immer richtig eingegebene Vokabeln:");
  perfekte.forEach(([wort, stat]) => {
    log(`  „${wort}“ – ${stat.richtig}x richtig eingegeben`);
  });
}

// ---------- Vokabel-Abfrage ----------

// startet die Abfrage für eine gespielte Spielerkarte; ruft "weiter" nach Abschluss auf
function starteVokabelAbfrage(cardId, weiter) {
  const karte = CARDS[cardId];
  const anzahl = karte.strength;

  state.phase = "vokabelAbfrage";
  state.vokabelAufgaben = ziehVokabelAufgaben(anzahl);
  state.vokabelWeiter = weiter;
  state.vokabelPunkte = 0;
  state.vokabelAusgewertet = false;

  render();
  renderVokabelAbfrage();
}

// wählt "anzahl" zufällige Vokabeln (mit Wiederholung, falls zu wenige vorhanden sind)
// wählt "anzahl" Vokabeln aus: zuerst falsch beantwortete oder noch nie gefragte,
// erst wenn diese aufgebraucht sind, werden bereits richtig beantwortete erneut verwendet
function ziehVokabelAufgaben(anzahl) {
  const alleIndices = VOKABELN.vokabeln.map((_, i) => i);
  if (alleIndices.length === 0) return [];

  const prioritaet = alleIndices.filter(i => {
    const stat = state.vokabelStatistik[VOKABELN.vokabeln[i]];
    return !stat || stat.zuletzt !== "richtig"; // null (nie gefragt) oder "falsch"
  });
  const rest = alleIndices.filter(i => {
    const stat = state.vokabelStatistik[VOKABELN.vokabeln[i]];
    return stat && stat.zuletzt === "richtig";
  });

  let pool = [...mische(prioritaet), ...mische(rest)];

  const indices = [];
  while (indices.length < anzahl) {
    if (pool.length === 0) {
      // mehr Vokabeln nötig als vorhanden sind -> von vorne beginnen
      pool = mische(alleIndices);
    }
    indices.push(pool.shift());
  }

  return indices.map(i => ({
    wort: VOKABELN.vokabeln[i],
    vorlesetext: VOKABELN.audio[i],
    eingabe: "",
    status: null // null | "richtig" | "falsch"
  }));
}

// zeigt die Abfrage als Overlay über dem restlichen Spiel an
function renderVokabelAbfrage() {
  let overlay = document.getElementById("vokabel-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "vokabel-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);" +
      "display:flex;align-items:center;justify-content:center;z-index:1000;";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = "";

  const box = document.createElement("div");
  box.style.cssText = "background:#222;padding:20px;border-radius:10px;max-width:500px;width:90%;font-family:sans-serif;";

  const titel = document.createElement("h3");
  titel.textContent = `Vokabel-Check (${state.vokabelAufgaben.length} Wort${state.vokabelAufgaben.length === 1 ? "" : "e"})`;
  titel.style.color = "#eee";
  box.appendChild(titel);

  state.vokabelAufgaben.forEach(aufgabe => {
    const zeile = document.createElement("div");
    zeile.style.cssText = "display:flex;align-items:center;gap:10px;margin:10px 0;";

    const audioBtn = document.createElement("button");
    audioBtn.textContent = "🔊";
    audioBtn.title = "Wort vorlesen";
    audioBtn.style.cssText =
      "font-size:1.2em;cursor:pointer;background:#444;border:none;border-radius:6px;color:#fff;padding:6px 10px;";
    audioBtn.addEventListener("click", () => {
      sprich(aufgabe.vorlesetext);
    });

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Wort eingeben";
    input.value = aufgabe.eingabe;
    input.disabled = aufgabe.status !== null;
    input.style.cssText =
      "flex:1;padding:6px;border-radius:4px;border:1px solid #555;background:#111;color:#eee;";
    if (aufgabe.status === "richtig") {
      input.style.borderColor = "#4caf50";
      input.style.color = "#4caf50";
    } else if (aufgabe.status === "falsch") {
      input.style.borderColor = "#e53935";
      input.style.color = "#e53935";
    }
    input.addEventListener("input", (e) => { aufgabe.eingabe = e.target.value; });

    zeile.appendChild(audioBtn);
    zeile.appendChild(input);
    box.appendChild(zeile);
  });

  const submitBtn = document.createElement("button");
  submitBtn.textContent = state.vokabelAusgewertet
    ? "Weiter"
    : "Abschicken";
  submitBtn.style.cssText =
    "margin-top:15px;padding:8px 16px;cursor:pointer;background:#7fd;border:none;border-radius:6px;font-weight:bold;";
  submitBtn.addEventListener("click", () => {
    if (!state.vokabelAusgewertet) {
      werteVokabelAbfrageAus();
    } else {
      schliesseVokabelAbfrage();
    }
  });
  box.appendChild(submitBtn);

  if (state.vokabelAusgewertet) {
    const ergebnis = document.createElement("div");
    ergebnis.style.cssText = "margin-top:10px;color:#ffd166;";
    ergebnis.textContent = `${state.vokabelPunkte} von ${state.vokabelAufgaben.length} richtig – das zählt als deine Stärke in diesem Kampf.`;
    box.appendChild(ergebnis);
  }

  overlay.appendChild(box);
}

// vergleicht die Eingaben, färbt richtig/falsch ein und zählt die Punkte
function werteVokabelAbfrageAus() {
  let richtig = 0;
  state.vokabelAufgaben.forEach(aufgabe => {
    const istRichtig = normalisiere(aufgabe.eingabe) === normalisiere(aufgabe.wort);
    aufgabe.status = istRichtig ? "richtig" : "falsch";
    if (istRichtig) richtig++;

    const stat = state.vokabelStatistik[aufgabe.wort];
    if (stat) {
      if (istRichtig) stat.richtig++; else stat.falsch++;
      stat.zuletzt = istRichtig ? "richtig" : "falsch";
    }
  });
  state.vokabelPunkte = richtig;
  state.vokabelAusgewertet = true;
  log(`Vokabel-Check: ${richtig} von ${state.vokabelAufgaben.length} richtig.`);
  renderVokabelAbfrage();
}

function normalisiere(text) {
  return (text || "").trim();
}

// liest einen Text per Sprachsynthese des Browsers vor (deutsch)
function sprich(text) {
  if (!("speechSynthesis" in window)) {
    log("Sprachausgabe wird von diesem Browser nicht unterstützt.");
    return;
  }
  speechSynthesis.cancel(); // laufende Ausgabe abbrechen, falls mehrfach geklickt
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  speechSynthesis.speak(utterance);
}

// schließt das Overlay und setzt das eigentliche Spiel fort
function schliesseVokabelAbfrage() {
  const overlay = document.getElementById("vokabel-overlay");
  if (overlay) overlay.remove();

  state.spielerVokabelPunkte = state.vokabelPunkte;
  const weiter = state.vokabelWeiter;

  state.vokabelAufgaben = null;
  state.vokabelWeiter = null;
  state.vokabelAusgewertet = false;

  weiter();
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
