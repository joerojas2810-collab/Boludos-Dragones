# Arte reutilizable y referencias

## Extensión necesaria: cero dibujos obligatorios

La primera versión puede construirse con los recursos actuales y composición de interfaz. No hace falta otro lote de personajes, enemigos, fondos ni efectos. Esta conclusión procede del inventario de archivos y sus mappings; la legibilidad final exige revisión dentro del juego.

Conservar pintado y pixel con idénticos significados, duraciones y señales. Distinguir «Cuenta», «Esta expedición» y «Próximo combate» mediante etiquetas además de color. Las reliquias son iconos existentes con nueva lógica; tener un dibujo no significa que su efecto ya exista.

## Recursos concretos

`DoorIcon.tsx` ya relaciona combate con stat_attack, dificultad con skill_double_strike, jefe con relic_titan_crown, tienda con relic_bottomless_purse, descanso con event_abandoned_campfire, evento con event_whispering_book y cofre con system_chest. Reusar esos símbolos en rutas y servicios, con texto de propósito.

El catálogo propuesto usa 18 IDs existentes: bear_heart, bronze_armor, hunter_lens, whetstone, winged_boots, bottomless_purse, runic_shield, old_book, duelist_glove, thirsty_chalice, blood_ring, dragon_fang, moss_amulet, broken_clock, plate_armor, scholar_seal, vorpal_blade y phoenix_heart. Resolver mediante artIds.json y el sistema de arte actual, sin inventar rutas de archivos.

Eventos: shining_fountain, forgotten_altar, abandoned_bag, whispering_book, ruby_statue y suspicious_beggar. Los iconos regen, shield, double_attack y changing_element cubren modificadores; mostrar incompatibilidades mediante reglas, no crear una ilustración por combinación.

El inventario contiene 24 reliquias base, variantes de rareza y emblemas en ambos estilos; ocho eventos y recursos de interfaz. Existen 24 escenas base —seis de hub, nueve normales y nueve de jefe— y exportaciones específicas de estilo/resolución. Los cientos de archivos de enemigos incluyen variantes de elemento, categoría y estado: no equivalen a cientos de diseños independientes. Consultar backgrounds.generated.ts, backgrounds.ts y painted-backgrounds.generated.json antes de cambiar rutas.

Los nueve temas existentes pueden rotar entre sectores; evitar exigir un fondo nuevo por cada diez pisos. Siluetas, entradas, impactos, quiebre, ritual y reconstrucción ya desarrollados deben permanecer conectados. Un enemigo élite se comunica con marco, etiqueta y modificador; no necesita sprite exclusivo por build.

## Trabajo artístico real de integración

Preparar tarjetas de ruta, marcos de reliquiaI/II, seis espacios, panel de build, santuario y resumen de sector mediante componentes y recursos actuales. Ajustar contraste, escala, espaciado y foco; mostrar animación sólo donde explica cambio de estado. Reutilizar efectos existentes sin añadir una celebración que retrase cada nodo. Respetar movimiento reducido.

Pulido opcional posterior: tres diseños —emblema de expedición, marca de bendición temporal y sello de sector superado— en dos estilos: seis versiones finales. No son requisito del alcance inicial ni se han generado en esta investigación. Si se solicitan, ChatGPT produce imágenes y Claude integra; el trabajo lógico no depende de ellas.

## Investigación y límites

[Mega Crit: Slay the Spire](https://www.megacrit.com/press-kits/slay-the-spire/) respalda tomar como referencia combinaciones de build y reliquias. [Supergiant: Hades FAQ](https://www.supergiantgames.com/blog/hades-faq/) describe variedad de partidas, aprendizaje y progresión. [Notas oficiales de Hades](https://www.supergiantgames.com/blog/hades-the-nighty-night-update-patch-notes/) aportan ejemplos de alternativas y exclusiones entre modificadores.

Las fuentes inspiran principios; no validan nuestros números ni prometen retención. Dieciocho reliquias, seis espacios, siete combates por sector y economía son hipótesis concretas para implementar y medir. No copiar arte, texto, interfaz ni fórmulas de esos juegos.
