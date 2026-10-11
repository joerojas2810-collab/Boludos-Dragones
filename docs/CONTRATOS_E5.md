# CONTRATOS_E5 — Etapa 5: Explotar estado

**Estado:** contrato para el programador (ChatGPT/Codex). Rama `v2`. Diseño: `COMBATE_V2.md` §8. Un solo agente toca `combat.ts` a la vez. **Sin SQL, push ni merge a `main`.** Dudas de diseño: `CRUCE_IAS.md`. `ENGINE_VERSION` sube a **16** en 5a.

## Hallazgo de la auditoría (afecta al plan)
El **acumulador de progreso de E2 es solo un prototipo aislado**: el motor real sigue siendo por rondas (`planRound`/`actionCounts`/`buildQueue`, con `carry` por enemigo). Los efectos de "restar o sumar puntos de progreso" (Escarcha e Impulso) **no tienen dónde aplicarse** hasta decidir cómo se representan en el motor real (ver **Q17** en `CRUCE_IAS.md`). Por eso la etapa se divide en:

## 5a — Explotar y los efectos que no dependen del progreso
Habilitar **Explotar estado** (hoy deshabilitado con motivo) para **Quemadura, Ruptura y Sobrecarga**, y el daño común:
- Habilitado solo si el PJ tiene (o el objetivo elegido tiene) un estado que consumir (portador según el estado: Quemadura y Ruptura en el enemigo; Sobrecarga e Impulso del PJ).
- **Daño común:** 40 % del daño del básico del PJ con el arma equipada (ATQ del arma sumado al ATQ del PJ antes del cálculo); un objetivo; no aplica cargas nuevas.
- **Valores de partida, pendientes de aprobación del dueño (Q16):** **Quemadura:** consume todas las cargas y adelanta un tic de daño respetando `BURN_CAP` (6 % de vida máx. por ronda), sin adelantar tics futuros. **Ruptura:** consume todas; el siguiente ataque del PJ ignora 8 % de DEF por carga (máx. 24 %) y luego expira. **Sobrecarga (Rayo):** con 3 cargas (`charge`), Explotar descarga +40 % del daño del básico y reinicia el contador; sin 3 cargas, deshabilitada. (Hoy la Sobrecarga acumula pero ya no estalla sola: Explotar devuelve ese bono.)
- **Detonar:** ya retirado; el **Mago** usa Explotar con +25 % a la magnitud del efecto. Calibrar por debajo del Detonar histórico (~57 % sobre el resto).
- **Ganchos de clase de Explotar** de `COMBATE_V2.md` §6.2 (Caballero escudo 3 %, Pícaro con Impulso, Clérigo cura 3 %, Berserker con Quemadura bajo 50 %), con los topes de cura/escudo existentes.
- Regla común de cargas de §8 sin cambios (máx. 3; Defender consecutivo conserva/pierde cargas).
- **Pruebas:** determinista; Explotar consume y no añade cargas; deshabilitado sin estado; cada efecto con su tope; replay del servidor acepta `explotar`; `autoPolicy` lo usa cuando conviene; simulación contra la línea base y el piso de ruido (`docs/E2_RESULTADO.md`) midiendo **por elemento** (Rayo debe recuperar su bono perdido en 3c: `docs/E3_ELEMENTOS.md`).

## 5b — Escarcha e Impulso (Q17-B aprobado: se mantienen las rondas y la lógica de batalla y acciones actuales)
**No se integra el acumulador de E2 en el motor real.** Los efectos de "progreso" se traducen al modelo por rondas (valores de partida, se ajustan con simulación):
- **Escarcha (enemigo):** Explotar consume las cargas y **retrasa la próxima ranura pendiente del enemigo objetivo**: pasa a ejecutarse después de la siguiente acción del PJ. Máximo **1 retraso por enemigo y por ronda**; no afecta a una ranura que ya se resolvió ni a intenciones fuertes que ya recibieron su espera de aviso; con 3 cargas puede retrasar hasta 2 ranuras del mismo enemigo.
- **Impulso (PJ):** Explotar consume las cargas y concede **1 acción extra al PJ en la ronda en curso** si consumió ≥ 2 cargas; máximo 1 acción extra por ronda y sin superar `MAX_ACTIONS_PER_ROUND` (3). No concede acción inmediata gratis: la acción extra se añade a la cola tras la acción actual.
- Cualquier efecto que cambie `buildQueue`/`planRound` debe conservar el orden determinista y el replay del servidor.

## Puertas
`tsc`, `eslint src scripts`, `vitest` y `pglite` en verde; balance dentro del piso de ruido + 2 pp por clase, con Rayo recuperado; auditoría de Claude antes de 5b.
