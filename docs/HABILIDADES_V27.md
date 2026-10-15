# Identidad y progresión de habilidades — motor27

Revisión del15/10/2026. Veinte habilidades, dos equipadas, cuatro botones. Maestría compartida por clase: dos iniciales, alternativa a5 y otra a12. En Nivelado todas disponibles. No se agregan habilidades ni arte.

| Habilidad | Regla vigente |
|---|---|
| Bastión | Protección pura: escudo10%PVmáx, coste2,CD1, sin atacar |
| Barrera | Golpe50%, aplica carga normal y escudo6%PVmáx, coste1,CD1, no consume |
| Paso evasivo | Golpe65% y reduce40% el próximo impacto hasta siguiente turno propio, coste1,CD1, no consume; no garantiza esquiva |
| Sello | Golpe50%, hasta2 cargas elementales, interrumpe ritual si hace daño, coste1,CD1 |
| Sabotaje | Golpe75%, Aguante100% del daño de vida efectivo, interrumpe ritual si hace daño, coste1,CD1; no cancela Carga ni consume |
| Juicio | Golpe75%, genera2 Bendición; básico conserva mayor daño inmediato |
| Restaurar | Inicial junto a Juicio: cura6%PVmáx, coste2,CD1 |
| Consagrar | Alternativa a maestría5: golpe165% y consume, coste2, sin cura |

Los valores de Aguante no son multiplicadores del daño de vida. Rompeguardia hace125% del básico y Aguante125% del daño de vida; Rompemuro hace100% del básico y Aguante150%. Los porcentajes comparan con el básico del propio héroe, no el daño absoluto entre clases.

Clérigo inicial puede acumular estados y aprovechar sus efectos, pero no consumirlos hasta equipar Consagrar al5. Esto expresa su identidad de curación desde el comienzo. La selección muestra roles y consecuencias de llevar dos gastadores o ninguna habilidad consumidora; no bloquea pares legales.

Barrera y Paso mantienen protección aunque el objetivo absorba el golpe. No conceden Defender ni guardia perfecta. La reducción de Paso cubre un impacto; no toda una secuencia de enemigos. Sello/Sabotaje no cancelan cualquier intención, sólo ritual anunciado; se mantiene el requisito de impacto efectivo del motor.

La pasiva del Mago comunica el bonus25% a consumo desde la misma constante que usa combate. Resolver rápido valora carga adicional sólo cuando caben dos cargas, cuenta una sola limpieza y aproxima la protección de Paso con el primer impacto proyectado anterior al siguiente turno propio. Sigue siendo una heurística, no un sustituto del juego manual.

## Integración y versiones

ENGINE_VERSION pasa26→27: no reinterpretar logs/checkpoints antiguos como si usaran el nuevo catálogo. Conservar la validación existente y su error explícito por versión incompatible; no borrar guardados para ocultarlo.

La migración `0060_skill_identity.sql` actualiza skill_unlock; no borra cuentas ni configuraciones. Los loadouts antiguos del Clérigo que tengan Consagrar antes de maestría5 pasan por el saneamiento existente al nuevo par inicial. Los de maestría≥5 conservan su elección válida. Para base al día en0059 usar `supabase/upgrade_from_0060.sql`, previa revisión y autorización de aplicación; no aplicar a producción automáticamente ni publicar código antes de actualizar SQL.

Se mantienen los otros desbloqueos y los IDs estables. Catálogo ejecutable en skills.ts; las propuestas antiguas de docs/ideal no prevalecen sobre esta revisión.
