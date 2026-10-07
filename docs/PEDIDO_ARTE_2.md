# Pedido de arte 2: logo, rangos y ascensiones

Enviar junto con 3 a 5 imágenes ya entregadas como referencia de estilo (por ejemplo `public/art/ui/logo_primary.webp`, `public/art/icons/icon_rank_s.webp`, `icon_dungeon_rank_ssr.webp`, `icon_relic_phoenix_heart.webp`).

## Prompt

Eres el ilustrador del juego "Boludos & Dragones", un RPG por turnos de fantasía para jugar con amigos. Necesito tres entregas de íconos en el MISMO estilo de las imágenes de referencia adjuntas: fantasía pintada, metal bruñido y piedra oscura con detalles de cobre, brillo suave, contorno oscuro fino, iluminación desde arriba a la izquierda. El juego tiene la interfaz en pizarra azul oscura, así que todo debe leerse bien sobre fondo oscuro (#1d2733) y a 64 px.

**Reglas para todo lo que entregues**
- Solo diseños finales usables: un archivo por ícono, PNG con fondo transparente real (sin fondo, sin sombra proyectada fuera del ícono, sin marco de presentación, sin mockups, sin variantes descartadas, sin textos de nota).
- Cuadrado, 512×512 px, el motivo centrado ocupando ~85% del lienzo (margen parejo, nada cortado).
- NINGUNA letra, número ni texto dentro de los íconos (el juego dibuja letras y números encima con su propia tipografía), salvo el logo del punto 1.
- Misma escala, grosor de contorno y nivel de detalle entre íconos de una misma serie; que una serie se lea como familia.
- Nombres de archivo exactos como en la lista. Entrega además una hoja de contacto (un solo PNG con todos juntos) solo para revisión, aparte y claramente nombrada `_contacto.png`.

**1. Nombre del juego (logo real)**: "Boludos & Dragones"
- `logo_emblem.png`: emblema sin texto (un dragón pequeño o cresta con escudo, tono humorístico pero épico; no serio-oscuro), que funcione como ícono de aplicación y favicon: debe leerse a 32 px. 1024×1024, con un fondo propio redondeado (escudo/medallón) incluido.
- `logo_emblem_flat.png`: el mismo emblema, versión simplificada de pocos colores y contorno grueso para 16 y 32 px (favicon).
- `logo_wordmark.png`: solo el texto "Boludos & Dragones" en letras pintadas con relieve metálico, horizontal, 2048×512, con el "&" decorado. Que se entienda cada letra.
- `logo_primary.png`: emblema + wordmark juntos, horizontal, 2048×768.
- `logo_stacked.png`: emblema arriba, nombre en dos líneas debajo ("Boludos" / "& Dragones"), 1024×1024.
- `logo_mono.png`: wordmark + emblema en una sola tinta crema (#f6ead6) sobre transparente, para sobreponer en imágenes.

**2. Rangos (rarezas) F, E, D, C, B, A, S, SS, SSR**: 9 insignias que escalan en riqueza, sin letra.
- Una insignia por rango, forma de medallón/blasón que se vuelve más elaborada al subir: F madera/hierro simple; E bronce; D acero; C acero azulado; B plata; A amatista; S oro; SS oro con alas o llamas; SSR corona/ornato máximo con gemas y brillo. Un hueco central limpio y liso donde el juego dibuja la letra.
- Colores de acento por rango (mantener): F `#9ca3af`, E `#4ade80`, D `#2dd4bf`, C `#60a5fa`, B `#818cf8`, A `#c084fc`, S `#fbbf24`, SS `#fb923c`, SSR `#f43f5e`.
- Archivos: `rank_f.png`, `rank_e.png`, `rank_d.png`, `rank_c.png`, `rank_b.png`, `rank_a.png`, `rank_s.png`, `rank_ss.png`, `rank_ssr.png`.
- Además, 9 marcos para tarjetas de ítem/personaje: `frame_f.png` … `frame_ssr.png`, 768×1024, solo el marco (interior transparente, esquinas decoradas, mismo material y color que su insignia).

**3. Ascensiones (niveles 0 a 5 de un dungeon)**: 6 emblemas que forman una serie de dificultad creciente; cada uno con su motivo y cada vez más amenazante (grietas, llamas, cuernos, o un halo oscuro que crece). Material neutro (hierro negro y cobre) con un acento rojo-naranja creciente, para que el juego lo tiñe con el color del dungeon por encima.
- `asc_0.png` Normal: un escudo/sello limpio, sin amenaza (la base de la serie).
- `asc_1.png` Enemigos más duros: espada cruzada con una calavera pequeña.
- `asc_2.png` Las fogatas curan la mitad: fogata apagándose, con brasas.
- `asc_3.png` Peleas difíciles con un enemigo más: tres cuernos o tres cabezas de monstruo.
- `asc_4.png` Los jefes atacan dos veces: calavera coronada con dos zarpazos.
- `asc_5.png` Empiezas con 2 vidas (máximo): corazón partido con corona de espinas y aura roja; es el más imponente.
- `asc_max_star.png`: pequeña estrella dorada de "ascensión máxima superada" (reemplaza el ★ de texto), 256×256.

**Qué NO hacer**: no repetir elementos ya entregados (corazones, monedas, íconos de elementos), no escribir texto, no entregar versiones alternativas ni "opciones" sin elegir.

## Qué falta además (a pedir si se quiere cerrar el arte)
- Íconos de modo/sistema sin ícono propio hoy: **Torre semanal**, **Misiones** (diarias, semanales, Viernes de sala), **Ascensión** (ícono general de la pestaña) y **Jefe cooperativo**. Hoy se usan íconos prestados.
- `social_share` (1200×630) no se entregó; hoy se generó `public/og.png` por código.
- Retratos de héroe (busto) y arte de los legendarios de los amigos siguen pendientes.
- Sonido y música (fuera del alcance de este pedido).
