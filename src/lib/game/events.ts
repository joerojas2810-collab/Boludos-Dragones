import type { UpgradeId } from "./progression";

export interface EventEffect {
  coins?: number; // base amount, scaled by floor
  hp?: number; // fraction of max hp (never kills: leaves at least 1)
  xp?: number;
  stat?: UpgradeId;
  lives?: number;
}

export interface EventOutcome {
  p: number; // weights, normalized when rolled
  text: string;
  effect: EventEffect;
}

// Paid before the outcome; the choice is unavailable if it can't be afforded.
export interface EventCost {
  coins?: number; // base amount, scaled by floor
  hp?: number; // fraction of max hp; must leave at least 1 hp
}

export interface EventChoice {
  label: string;
  cost?: EventCost;
  outcomes: EventOutcome[];
}

export interface GameEvent {
  title: string;
  text: string;
  choices: EventChoice[];
}

const none: EventEffect = {};

export const EVENTS: readonly GameEvent[] = [
  {
    title: "Fuente brillante",
    text: "Una fuente de agua brillante burbujea en medio de la sala.",
    choices: [
      {
        label: "Beber",
        outcomes: [
          { p: 3, text: "Sabe a miel. Te sientes mejor.", effect: { hp: 0.3 } },
          { p: 1, text: "Estaba envenenada.", effect: { hp: -0.2 } },
        ],
      },
      {
        label: "Seguir de largo",
        outcomes: [{ p: 1, text: "Mejor no.", effect: none }],
      },
    ],
  },
  {
    title: "Mendigo sospechoso",
    text: "Un viejo te pide unas monedas con una sonrisa dudosa.",
    choices: [
      {
        label: "Darle monedas",
        cost: { coins: 10 },
        outcomes: [
          {
            p: 1,
            text: "Te bendice: sientes más fuerza.",
            effect: { stat: "ataque" },
          },
          {
            p: 1,
            text: "Era un ladrón y se escapa con el botín.",
            effect: { coins: -5 }, // on top of the 10 paid
          },
        ],
      },
      {
        label: "Ignorarlo",
        outcomes: [{ p: 1, text: "Te alejas rápido.", effect: none }],
      },
    ],
  },
  {
    title: "Trampa de pinchos",
    text: "El piso cede bajo tus pies.",
    choices: [
      {
        label: "Saltar",
        outcomes: [
          { p: 2, text: "Caes de pie.", effect: none },
          { p: 1, text: "Te rasguñas la pierna.", effect: { hp: -0.15 } },
        ],
      },
    ],
  },
  {
    title: "Altar olvidado",
    text: "Un altar polvoriento pide una ofrenda.",
    choices: [
      {
        label: "Ofrecer sangre",
        cost: { hp: 0.2 },
        outcomes: [
          {
            p: 1,
            text: "El altar te concede poder.",
            effect: { stat: "furia" },
          },
        ],
      },
      {
        label: "Ofrecer monedas",
        cost: { coins: 20 },
        outcomes: [
          {
            p: 1,
            text: "El altar te protege.",
            effect: { stat: "defensa" },
          },
        ],
      },
      {
        label: "Irte",
        outcomes: [{ p: 1, text: "Nada ocurre.", effect: none }],
      },
    ],
  },
  {
    title: "Bolsa tirada",
    text: "Una bolsa abandonada yace junto a una pared.",
    choices: [
      {
        label: "Abrirla",
        outcomes: [
          { p: 3, text: "¡Monedas!", effect: { coins: 25 } },
          { p: 1, text: "Era una trampa de gas.", effect: { hp: -0.1 } },
        ],
      },
    ],
  },
  {
    title: "Libro susurrante",
    text: "Un libro abierto murmura secretos.",
    choices: [
      {
        label: "Leerlo",
        outcomes: [
          { p: 2, text: "Aprendes algo útil.", effect: { xp: 30 } },
          {
            p: 1,
            text: "Las palabras te marean.",
            effect: { hp: -0.1, xp: 10 },
          },
        ],
      },
      {
        label: "Cerrarlo",
        outcomes: [{ p: 1, text: "Mejor así.", effect: none }],
      },
    ],
  },
  {
    title: "Fogata abandonada",
    text: "Quedan brasas tibias y un poco de comida.",
    choices: [
      {
        label: "Comer y descansar",
        outcomes: [{ p: 1, text: "Recuperas fuerzas.", effect: { hp: 0.2 } }],
      },
    ],
  },
  {
    title: "Estatua con ojos de rubí",
    text: "Dos rubíes te miran desde una estatua.",
    choices: [
      {
        label: "Arrancar los rubíes",
        outcomes: [
          { p: 2, text: "Valen una fortuna.", effect: { coins: 40 } },
          {
            p: 1,
            text: "La estatua despierta y te golpea.",
            effect: { hp: -0.25 },
          },
        ],
      },
      {
        label: "Rezarle",
        outcomes: [
          { p: 4, text: "Sientes calma.", effect: { hp: 0.1 } },
          {
            p: 1,
            text: "La estatua te regala una nueva oportunidad.",
            effect: { lives: 1 },
          },
        ],
      },
    ],
  },
];
