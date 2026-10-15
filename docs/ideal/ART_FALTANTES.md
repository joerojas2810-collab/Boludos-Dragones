# Arte faltante: pedidos exactos para ChatGPT

Complementa `02-ARTE-PARA-CHATGPT.md` (dirección, gramática visual y plantilla §7). Cubre todo lo que `MISSING_SKILL_ART` (`src/lib/art/skillFx.ts`) declara y los iconos de UI que pide el motor. Dimensiones tomadas de los manifiestos reales: `src/lib/art/effects.generated.ts` (pintado), `src/lib/art/pixel-effects.generated.json` (pixel), `src/lib/art.ts` (rutas de iconos), `src/lib/art/pixel-icons.generated.json`.

No generar nada desde este documento sin el lote anterior aprobado (02 §4: primero impactos, luego consumos, consecuencias e iconos).

## 1. Formatos verificados

| Tipo | Pintado (runtime `.webp`) | Pixel (`.png`) | Grilla | Frames / fps / cierre |
|---|---|---|---|---|
| Impacto elemental (`hit_*`) | 1024 × 256 px, celda 256 × 256 | 512 × 128 px, celda 128 × 128 | 4 columnas × 1 fila, orden izquierda→derecha | 4 / 16 / remove |
| Consumo y consecuencia (nuevos) | 3072 × 512 px, celda 512 × 512 | 1152 × 192 px, celda 192 × 192 | 6 columnas × 1 fila | 6 / 8 / remove |
| Icono de habilidad o UI | 128 × 128 px `.webp` | 64 × 64 px `.png` | estático | n/a |

Reglas: fondo transparente real (alfa, no damero dibujado). Pixel: píxeles nítidos, sin antialias, sin reescalado suave; exportar a la celda exacta sin interpolar. Pintado: conservar el acabado de las referencias y semitransparencia. Centro de la celda como ancla visual; nada cortado en los bordes de la celda (padding mínimo 8 px pintado / 4 px pixel).

Nombres: el efecto nuevo usa su ID en inglés (`consume_fire`). Icono de habilidad: `icon_skill_<id>` (pintado en `public/art/icons/`, pixel en `public/art/icons-px/`). Icono de UI: `icon_<grupo>_<nombre>`.

Importante para Claude Code (no para ChatGPT): los IDs nuevos requieren regenerar `effects.generated.ts` y `pixel-effects.generated.json` con `scripts/import-effects.mjs`, añadir las claves en `artIds.json` y los pixel-icons con su generador. No editar los JSON a mano.

## 2. Cobertura de MISSING_SKILL_ART

| Entrada de MISSING | Resolución | Lote |
|---|---|---|
| knight_bastion (escudo propio) | Base: reutilizar `defend` (02 §4). Condicional si la prueba confunde | H (VFX `bastion_shield`), G (icono) |
| mage_barrier (barrera arcana) | Icono ya existe `arcane_shield`; falta VFX `barrier_arcane` | H |
| mage_seal (sello, interrumpe) | Icono nuevo `seal` (presupuesto 02) + VFX compartido `seal_interrupt` | D, H |
| rogue_sabotage (sabotaje) | Base: `double_strike` provisional (02). Condicional +1 icono `sabotage` | G, H (`seal_interrupt`) |
| rogue_step (paso evasivo) | Base: `flee`. Condicional icono `step` + VFX `dodge_trail` | G, H |
| cleric_restore (cura propia) | Base: `prayer`. Condicional VFX `heal_directed` | G, H |
| cleric_cleanse (purificación) | Icono nuevo `cleanse` + VFX `purify` | D, H |
| berserker_* (4 iconos) | Iconos nuevos `berserker_charge`, `berserker_release`, `berserker_recover`, `berserker_shatter` | D |
| attack_3 por clase | Revisión de Claude Code con las poses actuales; sin pedido (02 §4) | Revisión |
| staggerBroken (Quiebre) | VFX nuevo `stagger_broken` | C |
| statusConsumed (consumo por elemento) | VFX nuevos `consume_fire`, `consume_water`, `consume_wind`, `consume_earth`, `consume_lightning` | B |
| telegraphCancelled (ritual cancelado) | VFX nuevo `ritual_cancel` | C |
| progressChanged (cola adelantada/retrasada) | Sin hoja nueva: lo cubren `consume_water` (demora) y `consume_wind` (avance) más la cola de la UI | B |
| exposed (Expuesto) | Icono UI `state_expuesto` | E |
| aguante (icono propio) | Icono UI `state_aguante`; estados elementales ya usan `icon_element_*` con forma de marco en `StatusIcons` | E |

Recursos de clase (Resolución, Foco, Apertura, Bendición, Furia): reutilizar `icon_passive_wall`, `icon_passive_arcane_focus`, `icon_passive_deadly_edge`, `icon_passive_blessing` y `icon_upgrade_fury`, mostrando las tres marcas por UI (02 §4). No pedir dibujos nuevos salvo que la prueba a tamaño real falle; en ese caso pedir solo el lote G-recursos con los mismos criterios de icono.

Estados sin silueta propia (Escarcha, Quemadura, Impulso, Ruptura): cubiertos por `icon_element_*` y el marco de forma de `StatusIcons.tsx` (cuadrado negativo, círculo positivo). No pedir por ahora.

## 3. Lotes

Cada lote tiene como máximo 6 diseños. Cada diseño se entrega en pintado y en pixel. Enviar un lote a la vez y revisar la prueba antes del siguiente.

Plantilla común (02 §7), abreviada aquí en cada pedido: "Usá las imágenes de referencia adjuntas para conservar exactamente personaje, ropa, arma y proporciones [si aplica]. Necesito [ID], propósito [...], estilo [PINTADO/PIXEL]. ... Entrega [grilla], [celda], [frames], pivote centro, fondo transparente real. Sin texto ni interfaz dibujada; sin recortes en los bordes; continuidad entre cuadros."

### Lote A: impactos elementales (5 diseños, 10 hojas)

Reemplaza los actuales `hit_*`, que hoy comparten el mismo corte con cambio de color. Impacto en cuadro 2 (índice 1). Confirmar el marcador en preview (02 §5).

**A1 `hit_fire`**: llama y brasas ascendentes; brasa localizada, estallido corto. Pintado 1024×256 (4×256). Pixel 512×128 (4×128).
Pedido: "Necesito hit_fire, propósito impacto de fuego al golpear al objetivo, estilo PINTADO. Materia: llama ascendente y brasas. El efecto debe comunicar golpe ígneo, no un corte. Entrega 4 cuadros en una fila, celda 256×256, fondo transparente real. Secuencia: chispa → llama → brasas que se apagan. Impacto en cuadro 2."

**A2 `hit_water`**: fractura de cristal y flujo frío. Mismo formato.
Pedido: "... hit_water ... Materia: cristal y flujo. Secuencia: esquirlas de cristal → onda fría → cristales que se disuelven. Impacto en cuadro 2."

**A3 `hit_wind`**: corriente lateral y espiral. Mismo formato.
Pedido: "... hit_wind ... Materia: corriente lateral con estela espiral. Secuencia: ráfaga de entrada → espiral → disipación hacia el lateral. Impacto en cuadro 2."

**A4 `hit_earth`**: roca y grieta angular. Mismo formato.
Pedido: "... hit_earth ... Materia: bloques y grieta angular. Secuencia: grieta que se abre → fragmentos → polvo. Impacto en cuadro 2."

**A5 `hit_lightning`**: arco eléctrico quebrado y conectado. Mismo formato.
Pedido: "... hit_lightning ... Materia: trazo quebrado con arco conectado. Secuencia: destello → arco quebrado → chispas. Impacto en cuadro 2."

Control al cerrar el lote: los cinco deben distinguirse entre sí con la silueta sola, sin color (escala de grises).

### Lote B: consumo de estado (5 diseños, 10 hojas)

Se muestran al consumir una carga (Explotar). Deben ser claramente distintos de la aplicación del estado (02 §3). Pintado 3072×512 (6×512). Pixel 1152×192 (6×192). Impacto en cuadro 3 (índice 2).

**B1 `consume_fire`**: detonación de brasa. Fuego.
Pedido: "Necesito consume_fire, propósito consumir la Quemadura al explotar, estilo [ESTILO]. Materia: fuego ascendente. Resultado: concentración, estallido y desaparición de brasas. Entrega 6 cuadros en una fila, celda 512×512 (pixel 192×192). Secuencia: brasas se concentran → estallido en cuadro 3 → brasas se apagan. Impacto en cuadro 3."

**B2 `consume_water`**: rotura de escarcha con demora visible en la cola. Agua.
Pedido: "... consume_water ... propósito romper la Escarcha al explotar. Materia: cristal y flujo frío. Resultado: fractura de cristal y señal de demora. Secuencia: cristales vibran → fractura en cuadro 3 → fragmentos caen. Impacto en cuadro 3."

**B3 `consume_wind`**: impulso de viento con avance visible. Viento.
Pedido: "... consume_wind ... propósito consumir el Impulso al explotar. Materia: corriente lateral y espiral. Resultado: ráfaga hacia delante con avance visible. Secuencia: corriente se enrolla → ráfaga en cuadro 3 → estela que se va. Impacto en cuadro 3."

**B4 `consume_earth`**: concentración de penetración de tierra. Tierra.
Pedido: "... consume_earth ... propósito consumir la Ruptura al explotar. Materia: bloques y grietas angulares. Resultado: fragmentos convergen hacia el próximo golpe. Secuencia: fragmentos se acercan → convergen en cuadro 3 → punto de penetración. Impacto en cuadro 3."

**B5 `consume_lightning`**: descarga de rayo con nodos. Rayo.
Pedido: "... consume_lightning ... propósito descargar la Sobrecarga al explotar. Materia: trazos quebrados y arcos conectados entre nodos. Resultado: conexión de nodos, descarga y apagado. Secuencia: nodos se conectan → descarga en cuadro 3 → apagado. Impacto en cuadro 3."

Control: un Quiebre no debe parecer un consumo. Revisar que la silueta de B1–B5 no repita la de A1–A5.

### Lote C: consecuencias (3 diseños, 6 hojas)

Pintado 3072×512 (6×512). Pixel 1152×192 (6×192). Impacto en cuadro 3.

**C1 `stagger_broken`**: Quiebre. Aguante agotado: el enemigo queda Expuesto y se cancela una Carga compatible. Forma: fractura de armadura en rombo, placas que saltan. Distinguirlo de daño ordinario aun a escala pequeña y sin audio.
Pedido: "Necesito stagger_broken, propósito mostrar el Quiebre (Aguante agotado), estilo [ESTILO]. Materia: placa de armadura que se fractura en rombo. Resultado: quiebre inconfundible, no daño. Secuencia: grieta en la placa → fractura en cuadro 3 → fragmentos. Impacto en cuadro 3."

**C2 `ritual_cancel`**: cancelación de ritual interrumpido (Interrumpir a la Reina Marchita o Sello/Sabotaje). Forma: sello que se rompe o se apaga.
Pedido: "Necesito ritual_cancel, propósito mostrar un ritual anunciado cancelado, estilo [ESTILO]. Forma: círculo de sello que se rompe. Resultado: el ritual se apaga; debe diferir del Quiebre (C1). Secuencia: círculo gira → se quiebra en cuadro 3 → se apaga. Impacto en cuadro 3."

**C3 `armor_rebuild`**: reconstrucción de armadura (intención Reconstruir). Forma: placas que vuelven a encajar.
Pedido: "Necesito armor_rebuild, propósito reconstrucción de armadura del enemigo, estilo [ESTILO]. Materia: placas y grietas que se cierran. Resultado: armadura que vuelve a cerrarse; no es curación. Secuencia: grietas abiertas → placas encajan en cuadro 3 → superficie cerrada. Impacto en cuadro 3."

### Lote D: iconos de habilidad (6 diseños, 12 imágenes)

Icono estático, 128×128 pintado (`public/art/icons/icon_skill_<id>.webp`), 64×64 pixel (`public/art/icons-px/icon_skill_<id>.png`). Fondo transparente, silueta centrada, sin texto. Mismo símbolo en ambos estilos.

**D1 `icon_skill_berserker_charge`**: Furia que se carga con coste de vida. Símbolo: hacha con gota o marca de sangre hacia arriba.
Pedido: "Necesito icono icon_skill_berserker_charge (Carga de Furia, cuesta 2 % de vida), estilo [ESTILO]. Símbolo: hacha con marca de sangre ascendente. Icono 128×128 (pixel 64×64), fondo transparente, silueta centrada, sin texto. Clase Berserker (pelirroja con hacha: no cambiar diseño de personaje)."

**D2 `icon_skill_berserker_release`**: Descarga de Furia. Símbolo: hacha con estallido.
Pedido: "... icon_skill_berserker_release (Descarga de Furia) ... Símbolo: hacha con estallido radial. ..."

**D3 `icon_skill_berserker_recover`**: Sed de sangre (cura por daño). Símbolo: gota que sube o corazón con hacha.
Pedido: "... icon_skill_berserker_recover (Sed de sangre, recupera vida) ... Símbolo: gota de sangre con flecha ascendente. ..."

**D4 `icon_skill_berserker_shatter`**: Rompe el Aguante. Símbolo: hacha que parte un escudo.
Pedido: "... icon_skill_berserker_shatter (Rompe el Aguante) ... Símbolo: hacha que parte un escudo agrietado. ..."

**D5 `icon_skill_seal`**: Sello de Mago, interrumpe el ritual. Símbolo: sello circular con línea de corte.
Pedido: "... icon_skill_seal (Sello, interrumpe ritual) ... Símbolo: sello circular atravesado por una línea de corte. ..."

**D6 `icon_skill_cleanse`**: Purificar de Clérigo, quita estados negativos. Símbolo: gota o llama que se disuelve en luz.
Pedido: "... icon_skill_cleanse (Purificar, quita estados negativos) ... Símbolo: símbolo de luz que disuelve una marca oscura. ..."

Control: a 64 px, cada icono se lee distinto de los demás iconos de habilidad (`skillFx.ts`). Si no, indicar a Claude Code cuál y pedir un reemplazo.

### Lote E: iconos de estado y Aguante (4 diseños, 8 imágenes)

Iconos de UI, 128×128 pintado en `public/art/icons/icon_<nombre>.webp`, 64×64 pixel en `public/art/icons-px/icon_<nombre>.png`. Deben ser legibles en el marco pequeño de `StatusIcons`.

**E1 `icon_state_aguante`**: Aguante (barra de resistencia de élites y jefes). Símbolo: escudo con barra de vida parcial o medidor en arco.
Pedido: "Necesito icon_state_aguante (Aguante de élites y jefes), estilo [ESTILO]. Símbolo: escudo con medidor en arco. Fondo transparente, 128×128 (pixel 64×64), sin texto."

**E2 `icon_state_quiebre`**: Quiebre (Aguante agotado). Símbolo: rombo fracturado.
Pedido: "... icon_state_quiebre (Aguante agotado) ... Símbolo: rombo con fractura diagonal. ..."

**E3 `icon_state_expuesto`**: Expuesto (DEF −15 %). Símbolo: diana o marca abierta sobre silueta.
Pedido: "... icon_state_expuesto (DEF −15 %) ... Símbolo: diana abierta con flecha hacia abajo. ..."

**E4 `icon_intent_carga`**: intención Carga (golpe fuerte cancelable por Quiebre). Símbolo: flecha descendente pesada.
Pedido: "... icon_intent_carga (intención Carga, golpe fuerte) ... Símbolo: flecha pesada descendente. ..."

### Lote F: iconos de intención (3 diseños, 6 imágenes)

Mismo formato que el lote E.

**F1 `icon_intent_ritual`**: Ritual (canalización, interrumpible). Símbolo: runa circular abierta.
Pedido: "Necesito icon_intent_ritual (intención Ritual, interrumpible), estilo [ESTILO]. Símbolo: runa circular con apertura. ..."

**F2 `icon_intent_proteccion`**: Protección a un aliado. Símbolo: escudo sobre figura pequeña.
Pedido: "... icon_intent_proteccion (protege a un aliado) ... Símbolo: escudo sobre silueta. ..."

**F3 `icon_intent_reconstruccion`**: Reconstruir armadura. Símbolo: placas que encajan.
Pedido: "... icon_intent_reconstruccion (Reconstruir) ... Símbolo: placas en cuadrícula que encajan. ..."

## 4. Condicionales (no pedir sin la prueba del lote A-F)

Solo si la prueba en combate muestra confusión. No pedir todo de antemano.

### Lote G: iconos alternativos (4 diseños, 8 imágenes)

Cada uno reemplaza el icono prestado por defecto indicado en §2.

- `icon_skill_bastion`: Bastión de Caballero, reemplaza `defend`. Símbolo: muralla.
- `icon_skill_sabotage`: Sabotaje de Pícaro, reemplaza `double_strike`. Símbolo: daga que corta una cuerda.
- `icon_skill_step`: Paso evasivo, reemplaza `flee`. Símbolo: silueta que se desplaza en diagonal.
- `icon_skill_restore`: Restaurar de Clérigo, reemplaza `prayer`. Símbolo: cruz o gota con pulso.

Mismo formato: pintado 128×128 y pixel 64×64.

### Lote H: VFX adicionales (6 diseños, 12 hojas)

Fuera del presupuesto de 38 de 02 §4: requieren aprobación del dueño antes de generar. Formato: pintado 3072×512 (6×512) o pixel 1152×192 (6×192), salvo `heal_directed`, que sigue el mismo formato de 6 cuadros.

- `bastion_shield` (Bastión del Caballero): placa de muralla que se levanta. Impacto en cuadro 3.
- `barrier_arcane` (Barrera arcana del Mago): cúpula de runas que se cierra. Impacto en cuadro 3.
- `seal_interrupt` (Sello y Sabotaje, interrumpen): trazo de corte sobre un ritual. Impacto en cuadro 3.
- `dodge_trail` (Paso evasivo): estela de silueta que se desplaza. Impacto en cuadro 3.
- `heal_directed` (Restaurar): haz de luz dirigido al aliado. Impacto en cuadro 3.
- `purify` (Purificar): luz que disuelve una marca oscura. Impacto en cuadro 3.

Pedido tipo: "Necesito [ID], propósito [...], estilo [ESTILO]. Entrega 6 cuadros en una fila, celda 512×512 (pixel 192×192), fondo transparente real. Impacto en cuadro 3. Sin texto ni interfaz dibujada."

## 5. Orden y criterio de cierre

1. Lote A (5 impactos): probar dos elementos en combate (Fuego y Agua), revisar con la prueba de silueta.
2. Lote B (consumos) y C (consecuencias).
3. Lote D (iconos de habilidad) y E/F (UI).
4. Condicionales G y H solo tras la revisión del lote anterior.

Cantidad final: lotes A–F son 19 diseños, 38 recursos según 02 §4 (los iconos de UI E/F suman 7 diseños fuera de ese presupuesto y deben confirmarse; 02 §4 no los incluye). Derivados (reducido, compresión, previews) no cuentan como diseños nuevos.

## 6. Entrega para Claude Code

Por recurso: archivo con el nombre exacto de §1, ruta de destino según §1, transparencia real, grilla confirmada y origen del archivo (herramienta y fecha) en la nota de procedencia de 02 §6. Claude Code actualiza manifiestos generados y `skillFx.ts`; ChatGPT no edita código.
