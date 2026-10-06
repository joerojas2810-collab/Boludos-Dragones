# Pedido de arte completo (para un artista, un generador de imágenes o un agente)

**Enviar junto con:** `DUNGEONS_FORJA.md` (sistemas: rangos, equipo, dungeons, forja) y, si hace falta más detalle visual del estado actual, `MEJORA_VISUAL.md`. Estado al 2026-10-06: el juego se llama "Boludos & Dragones", es un RPG por turnos para jugar con amigos en la PC (el celular es secundario); idioma de la interfaz: español.

Hoy todo el arte sale de código: cuadrículas de 32x32 en SVG, sin archivos de imagen. Si lo cambias a arte hecho a mano o generado, esto es lo que hay que pedir. Las cantidades salen del juego actual más los cambios planeados en `DUNGEONS_FORJA.md`.

## 0. Antes de pedir nada: decisiones de estilo (sin esto cada pieza sale distinta)
1. Estilo: pixel art duro, pixel art suave, dibujo a mano, 2D vectorial, 3D prerenderizado, etc.
2. Resolución base de sprites: 32x32, 48x48, 64x64 o más. Si es pixel art, una sola escala para todo el juego.
3. Paleta: máximo de colores (por ejemplo 32 o 64) y su lista en HEX. Por elemento: Fuego, Agua, Tierra, Rayo y Viento, cada uno con color principal, oscuro, claro y de brillo.
4. Iluminación: luz arriba-izquierda (la actual) o la que prefieras, y grosor del contorno (1 px negro/marrón oscuro o sin contorno).
5. Proporciones: ¿chibi o realista? Hoy es pixel duro, ni chibi ni suave.
6. Referencias: 3 a 5 imágenes de juegos que te gusten y 2 que no.
7. Tono: humor y "boludos" (caricaturesco) o épico serio.
8. Licencia: el arte tiene que ser tuyo o con permiso comercial, sin marca de agua ni modelos entrenados con material con derechos.

## 1. Personajes (héroes)
- 4 clases: Caballero, Mago, Pícaro, Clérigo. Cada una en 5 elementos.
  - Opción A: un solo dibujo recoloreado por paleta (hoy). Entonces el arte debe venir con capas separadas (cuerpo, ropa, arma) y zonas de color definidas para poder teñirlas.
  - Opción B: 20 dibujos distintos (4 × 5).
- Poses por personaje, cada una como sprite sheet con N cuadros: inactivo (idle, 4 a 6 cuadros), ataque 1, ataque 2, ataque 3 (hechizo, tajo doble, etc.), defender, guardia perfecta, recibir golpe, esquivar, derrota y victoria. Si son sprites estáticos, al menos: idle, ataque, golpe y derrota.
- Vista: de frente o de 3/4. Hoy es de frente. Definir hacia dónde miran.
- Accesorios por rasgo (24 rasgos): un elemento chico por rasgo (gorra, cicatriz, bufanda…). Pedirlos como capa transparente encima del personaje, con el punto de anclaje de cada clase. Hoy algunos se leen mal: Escurridizo, Frágil, Temerario, Glotón.
- Retrato: busto cuadrado para tarjetas de colección, gacha y salas (opcional, si el sprite completo no queda bien chico).

## 2. Enemigos
- 5 familias: limo (Pantano), diablillo (Cumbres), arpía (Cañón), gólem (Cavernas), espectro (Tormenta). Si hay más mundos o dungeons, una familia nueva por cada uno.
- Por familia: versión normal, élite/difícil y jefe (más grande, corona, ojos rojos). Los jefes finales de cada dungeon necesitan nombre y sprite propio.
- Los enemigos también son de las 4 clases con pasivos, así que decidir si se muestran como esas clases o solo como monstruos.
- Poses: idle, ataque, golpe, derrota (mínimo). Recoloreables por elemento.
- Grupos de 1 a 3 enemigos en pantalla: dejar escala y espacio definidos.
- Entrada de jefe: ilustración o animación aparte.

## 3. Armas y equipo
- 9 tipos de arma × 5 elementos = 45 sprites: espada, hacha, lanza, arco, bastón, daga, maza, varita, libro. Cada clase usa 2 o 3: Caballero (espada, hacha, lanza), Mago (bastón, varita, libro), Pícaro (daga, arco), Clérigo (maza, bastón, libro). El arma equipada tiene que verse en el sprite del héroe.
- Variación visual por rango F a SSR (marco, brillo o gema); no hace falta redibujar cada arma 9 veces si el rango se muestra con un marco o efecto.
- Equipo nuevo, 5 casillas: casco, peto, piernas, zapatos, collar. Si se ven en el personaje, hay que dibujarlos sobre cada clase (capas). Si solo son íconos de inventario, uno por pieza y por rango.
- Arma en mano en el sprite del héroe: debe coincidir con el arma equipada, o un arma genérica por clase.
- Íconos de inventario: 32x32 o mayor, fondo transparente.

## 4. Partes y forja (nuevo)
- 14 partes de ítem (una por tipo: 9 armas + 5 equipos) y 5 núcleos por elemento. Cada una con 9 variantes de rango, o una base con marco por rango.
- Pantalla de forja: yunque o mesa, animación de armar, combinar y desmontar, chispas, éxito y fallo.
- Ícono de moneda y de ficha (hoy son distintos), fragmentos y estrellas (0 a 5).

## 5. Rangos, rarezas e íconos del sistema
- 9 rangos F, E, D, C, B, A, S, SS, SSR: color, insignia y marco de tarjeta de cada uno. Los colores actuales (provisionales, se pueden cambiar): F gris `#9ca3af`, E verde `#4ade80`, D turquesa `#2dd4bf`, C azul `#60a5fa`, B índigo `#818cf8`, A violeta `#c084fc`, S dorado `#fbbf24`, SS naranja `#fb923c`, SSR rojo-rosa `#f43f5e`. S, SS y SSR llevan brillo animado y una revelación especial en el gacha (rayos, destello).
- 5 íconos de elemento (hoy 8x8) con versión grande para tooltips y fondos.
- Íconos de rasgos (24), pasivos de clase (4), habilidades (2 base + 2 opciones de nivel 5 por clase = 16, más Defender y Huir), mejoras al subir de nivel (10 + 5 de tier 2), modificadores de enemigo (4), reliquias (24, con 3 niveles de rareza), eventos (8), tipos de puerta (pelea fácil, difícil, cofre, mercader, descanso, evento, jefe), vidas (corazones), poción, cofre.
- Íconos de rango de dungeon y de candado/desbloqueado.

## 6. Fondos y escenarios
- 5 mundos × 2 (normal y sala de jefe) = 10 fondos. Cada uno en capas para parallax (cielo, lejos, medio, suelo, primer plano), tamaño 1920x1080 mínimo o patrón repetible.
- Un fondo por dungeon si cada uno se ve distinto, más fondos para menú, gacha, colección, mercado, forja y salas.
- Variantes para ancho de PC y para vertical de celular.

## 7. Interfaz (UI)
- Panel marrón con borde doble naranja y pestaña de título, botones (normal, hover, presionado, desactivado, verde y gris), casillas, barras (vida, XP, tiempo de turno), tooltip, pestañas, modales, selector, deslizadores y casillas de marcar.
- Se pide como 9-slice (esquinas fijas, bordes que se estiran) para que escalen.
- Pantallas a maquetar: menú inicio, login, selección de clase, elegir personaje, equipar, run/dungeon (puertas, combate, mercader, evento, reliquia, mejoras, game over), gacha, colección, mercado, forja, salas (lobby, ranking, apuestas, interferir, podio), perfil/racha diaria.
- Tipografía: fuente (hoy Chakra Petch), licencia, tamaños. Si cambia, que tenga tildes y ñ.
- Logo del juego, favicon (varios tamaños) y imagen para compartir el enlace (1200x630).

## 8. Efectos visuales
- Números de daño (normal, crítico, curación, esquive), golpe por elemento (5 efectos), ventaja/desventaja elemental, guardia perfecta, escudo, regeneración, entrada de jefe, subida de nivel, victoria y derrota.
- Gacha: apertura de la tirada (animación de cada rareza), revelación, duplicado, pity.
- Confeti, podio, emotes de la tira de peleas en salas (decidir cuántos, por ejemplo 8 a 12).
- Partículas y brillos con la opción "reducir movimiento".

## 9. Sonido (opcional pero entra en "arte")
- Hoy los efectos se sintetizan por código. Pedir aparte: golpes por clase, críticos, fallos, hechizos, curación, victoria, derrota, UI (clic, error), gacha por rareza, forja y apuestas.
- Música: hoy no hay. Si se quiere, menú, combate, jefe, gacha y sala, todas en bucle.

## 10. Cómo pedir la entrega (para que se pueda integrar)
- Formato: PNG con transparencia para sprites y íconos; sprite sheets con cuadros del mismo tamaño y una tabla (nombre, cuadros, velocidad). SVG o PNG alto para logo y UI. Audio en OGG y MP3.
- Nombres de archivo en inglés y en minúscula, por ejemplo `hero_knight_fire_idle.png`.
- Punto de anclaje (pies del personaje) y caja de colisión/escala iguales en todas las poses.
- Fondos y capas separados; versión @1x y @2x si hay pantallas de alta densidad.
- Hoja de estilo y paleta como archivo (HEX) y una hoja de referencia con todas las piezas juntas para revisar coherencia.
- Revisiones: pedir primero 1 personaje, 1 enemigo, 1 arma, 1 fondo, 1 botón y 1 ícono (una "porción vertical"). Se aprueba el estilo y recién después se pide el resto.

## 11. Cantidades totales aproximadas
| Grupo | Piezas |
|---|---|
| Héroes (4 clases × 5 elementos × ~8 poses) | ~160 imágenes (o 4 × 8 si se recolorea) |
| Accesorios por rasgo | 24 |
| Enemigos (5 familias × 3 versiones × ~4 poses) | ~60 |
| Armas | 45 (+ marcos de rango) |
| Equipo, partes y núcleos | ~19 tipos × rangos |
| Íconos (rasgos, habilidades, mejoras, reliquias, eventos, puertas, sistema) | ~120 |
| Fondos | 10 a 15 (con capas) |
| UI (9-slice, botones, barras, modales) | ~40 |
| Efectos | ~30 |
| Sonidos | ~40 (más música opcional) |

## 12. Qué se puede dejar por código
Sombreado automático, recoloreado por elemento, partículas, marcos de rareza animados, confeti, parallax y animaciones de entrada pueden seguir generados por código aunque el arte sea de archivos. Eso reduce el pedido a sprites, íconos, fondos y UI.
